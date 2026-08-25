"""Lê a planilha de qualidade e gera uma carga SQL para o banco infinity_metalique.

A importação fica em Python porque openpyxl oferece suporte direto ao formato .xlsm.
O arquivo gerado pode ser revisado antes de sua aplicação manual no banco.

    py -3 database/importers/import_quality.py "caminho/RELATÓRIO DE INSPEÇÃO.xlsm"
    C:\\xampp\\mysql\\bin\\mysql.exe -u root --default-character-set=utf8mb4 \\
        infinity_metalique < database/importers/seed_quality.sql

O script é idempotente: o SQL gerado limpa as tabelas de qualidade antes de inserir.
"""

from __future__ import annotations

import datetime
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl

# Cada aba tem seu próprio layout; a primeira linha de dados foi conferida na planilha.
SHEET_ROWS = {
    "REGISTRO DE INSPEÇÃO": 5,
    "SAÍDA DE MÁQUINAS": 4,
    "REGISTRO DE RECLAMAÇÕES CLIENTE": 4,
    "REGISTRO DE PROBLEMAS START": 4,
    "CADASTRO DE COLABORADORES": 4,
    # A linha 3 traz os nomes das linhas de produto; os modelos vêm abaixo dela.
    "PRODUTOS": 3,
    "TABELA DE CÓDIGOS": 2,
}

# A limpeza segue a ordem inversa das dependências para não esbarrar nas chaves estrangeiras.
TABLES_TO_CLEAR = [
    "inspection_report_employees",
    "machine_dispatch_employees",
    "machine_dispatch_photos",
    "inspection_reports",
    "machine_dispatches",
    "customer_complaints",
    "startup_problems",
    "machine_models",
    "machine_types",
    "quality_codes",
    "employees",
    "clients",
]


def text(value: object) -> str:
    """Converte a célula em texto limpo, colapsando espaços repetidos."""
    if value is None:
        return ""
    if isinstance(value, datetime.datetime):
        return value.date().isoformat()
    return re.sub(r"\s+", " ", str(value)).strip()


def normalize(value: str) -> str:
    """Chave de deduplicação: sem acento, sem caixa, sem espaço sobrando."""
    stripped = unicodedata.normalize("NFKD", value)
    stripped = "".join(char for char in stripped if not unicodedata.combining(char))
    return stripped.upper().strip()


def as_date(value: object) -> str | None:
    if isinstance(value, datetime.datetime):
        return value.date().isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    return None


def sequence_of(code: str, fallback: int) -> int:
    """Extrai o número de RAP01 / RETIR1; cai no contador da linha se não houver."""
    digits = re.search(r"(\d+)", code)
    return int(digits.group(1)) if digits else fallback


def quote(value: object) -> str:
    """Literal SQL com escape manual - o arquivo é lido pelo cliente mysql, não por PDO."""
    if value is None or value == "":
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    escaped = (
        str(value)
        .replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\n", "\\n")
        .replace("\r", "")
        .replace("\x1a", "")
    )
    return f"'{escaped}'"


class Registry:
    """Guarda id incremental por chave normalizada, preservando o rótulo original."""

    def __init__(self) -> None:
        self.ids: dict[str, int] = {}
        self.labels: dict[str, str] = {}

    def id_for(self, label: str) -> int | None:
        label = text(label)
        if not label:
            return None
        key = normalize(label)
        if key not in self.ids:
            self.ids[key] = len(self.ids) + 1
            self.labels[key] = label
        return self.ids[key]

    def rows(self) -> list[tuple[int, str, str]]:
        return [(self.ids[key], self.labels[key], key) for key in self.ids]


def read_sheet(workbook: openpyxl.Workbook, name: str) -> list[tuple]:
    """Devolve as linhas de dados da aba, descartando as vazias."""
    sheet = workbook[name]
    start = SHEET_ROWS[name]
    return [
        row
        for row in sheet.iter_rows(min_row=start, values_only=True)
        if any(cell not in (None, "") for cell in row)
    ]


def build(path: Path) -> tuple[list[str], dict[str, int]]:
    workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)

    clients = Registry()
    employees = Registry()
    machine_types = Registry()

    statements: list[str] = []
    counts: dict[str, int] = {}

    # --- Códigos de não conformidade -------------------------------------------------
    code_ids: dict[str, int] = {}
    code_rows: list[str] = []
    for position, row in enumerate(read_sheet(workbook, "TABELA DE CÓDIGOS"), start=1):
        code, description = text(row[1]), text(row[2])
        if not code:
            continue
        code_ids[normalize(code)] = position
        code_rows.append(f"({position}, {quote(code)}, {quote(description)}, {position})")
    counts["quality_codes"] = len(code_rows)

    # --- Tipos de máquina e modelos (aba PRODUTOS) -----------------------------------
    product_rows = read_sheet(workbook, "PRODUTOS")
    header = product_rows[0]
    model_rows: list[str] = []
    model_id = 0
    for column in range(1, 9):
        type_name = text(header[column])
        if not type_name:
            continue
        type_id = machine_types.id_for(type_name)
        for row in product_rows[1:]:
            model_name = text(row[column]) if column < len(row) else ""
            if not model_name:
                continue
            model_id += 1
            model_rows.append(f"({model_id}, {type_id}, {quote(model_name)})")
    counts["machine_models"] = len(model_rows)

    # --- Colaboradores cadastrados ---------------------------------------------------
    for row in read_sheet(workbook, "CADASTRO DE COLABORADORES"):
        employees.id_for(text(row[1]))
    counts["employees_cadastrados"] = len(employees.ids)

    # --- RAPs ------------------------------------------------------------------------
    report_rows: list[str] = []
    report_employee_rows: list[str] = []
    skipped_reports = 0
    for index, row in enumerate(read_sheet(workbook, "REGISTRO DE INSPEÇÃO"), start=1):
        code = text(row[1])
        report_date = as_date(row[2])
        if not code or not report_date:
            skipped_reports += 1
            continue
        report_id = len(report_rows) + 1
        # Nesta aba a coluna 6 é o MODELO e a 7 é a MÁQUINA - o inverso da aba de saída.
        report_rows.append(
            "("
            + ", ".join(
                [
                    str(report_id),
                    quote(code),
                    str(sequence_of(code, index)),
                    quote(report_date),
                    quote(text(row[4]).upper()),
                    quote(clients.id_for(row[5])),
                    quote(machine_types.id_for(text(row[7]).upper())),
                    quote(text(row[6])),
                    quote(text(row[8]).upper()),
                    quote(text(row[9]).upper()),
                    quote(text(row[10]).upper()),
                    quote(text(row[11]).upper()),
                    quote(code_ids.get(normalize(text(row[12])))),
                    quote(text(row[13])),
                    "1" if normalize(text(row[17])).startswith("SIM") else "0",
                    quote(text(row[18])),
                ]
            )
            + ")"
        )
        for position, column in enumerate((14, 15, 16), start=1):
            employee_id = employees.id_for(text(row[column]))
            if employee_id:
                report_employee_rows.append(f"({report_id}, {employee_id}, {position})")
    counts["inspection_reports"] = len(report_rows)
    counts["inspection_report_employees"] = len(report_employee_rows)
    counts["raps_ignorados"] = skipped_reports

    # --- Coletas / saída de máquinas -------------------------------------------------
    dispatch_rows: list[str] = []
    dispatch_employee_rows: list[str] = []
    skipped_dispatches = 0
    for index, row in enumerate(read_sheet(workbook, "SAÍDA DE MÁQUINAS"), start=1):
        code = text(row[1])
        dispatch_date = as_date(row[3])
        if not code or not dispatch_date:
            skipped_dispatches += 1
            continue
        dispatch_id = len(dispatch_rows) + 1
        # Aqui a coluna 6 é a MÁQUINA e a 7 é o MODELO.
        dispatch_rows.append(
            "("
            + ", ".join(
                [
                    str(dispatch_id),
                    quote(code),
                    str(sequence_of(code, index)),
                    quote(dispatch_date),
                    quote(clients.id_for(row[5])),
                    quote(machine_types.id_for(text(row[6]).upper())),
                    quote(text(row[7])),
                    quote(text(row[8])),
                    "1" if normalize(text(row[12])).startswith("SIM") else "0",
                    quote(text(row[13])),
                ]
            )
            + ")"
        )
        for position, column in enumerate((9, 10, 11), start=1):
            employee_id = employees.id_for(text(row[column]))
            if employee_id:
                dispatch_employee_rows.append(f"({dispatch_id}, {employee_id}, {position})")
    counts["machine_dispatches"] = len(dispatch_rows)
    counts["machine_dispatch_employees"] = len(dispatch_employee_rows)
    counts["coletas_ignoradas"] = skipped_dispatches

    # --- Reclamações de cliente ------------------------------------------------------
    complaint_rows: list[str] = []
    for row in read_sheet(workbook, "REGISTRO DE RECLAMAÇÕES CLIENTE"):
        complaint_date = as_date(row[1])
        if not complaint_date:
            continue
        complaint_rows.append(
            "("
            + ", ".join(
                [
                    str(len(complaint_rows) + 1),
                    quote(complaint_date),
                    quote(clients.id_for(row[3])),
                    quote(machine_types.id_for(text(row[5]).upper())),
                    quote(text(row[4])),
                    quote(text(row[6])),
                    quote(text(row[7])),
                    quote(text(row[8])),
                    quote(text(row[9])),
                ]
            )
            + ")"
        )
    counts["customer_complaints"] = len(complaint_rows)

    # --- Problemas de partida (start) ------------------------------------------------
    startup_rows: list[str] = []
    for row in read_sheet(workbook, "REGISTRO DE PROBLEMAS START"):
        occurred_on = as_date(row[1])
        if not occurred_on:
            continue
        startup_rows.append(
            "("
            + ", ".join(
                [
                    str(len(startup_rows) + 1),
                    quote(occurred_on),
                    quote(clients.id_for(row[3])),
                    quote(machine_types.id_for(text(row[5]).upper())),
                    quote(text(row[4])),
                    quote(text(row[6])),
                    quote(text(row[7])),
                    quote(text(row[8])),
                    quote(text(row[9])),
                ]
            )
            + ")"
        )
    counts["startup_problems"] = len(startup_rows)

    workbook.close()

    counts["clients"] = len(clients.ids)
    counts["employees"] = len(employees.ids)
    counts["machine_types"] = len(machine_types.ids)

    # --- Montagem do arquivo ---------------------------------------------------------
    statements.append("-- Gerado por database/importers/import_quality.py. Não editar à mão.")
    statements.append(f"-- Origem: {path.name}")
    statements.append("SET NAMES utf8mb4;")
    statements.append("USE infinity_metalique;")
    statements.append("SET FOREIGN_KEY_CHECKS = 0;")
    for table in TABLES_TO_CLEAR:
        statements.append(f"TRUNCATE TABLE {table};")
    statements.append("SET FOREIGN_KEY_CHECKS = 1;")

    def insert(table: str, columns: str, values: list[str]) -> None:
        if not values:
            return
        statements.append(f"\nINSERT INTO {table} ({columns}) VALUES")
        statements.append(",\n".join(values) + ";")

    insert(
        "clients",
        "id, name, normalized_name",
        [f"({row[0]}, {quote(row[1])}, {quote(row[2])})" for row in clients.rows()],
    )
    insert(
        "employees",
        "id, name, normalized_name",
        [f"({row[0]}, {quote(row[1])}, {quote(row[2])})" for row in employees.rows()],
    )
    insert("quality_codes", "id, code, description, position", code_rows)
    insert(
        "machine_types",
        "id, name",
        [f"({row[0]}, {quote(row[1])})" for row in machine_types.rows()],
    )
    insert("machine_models", "id, machine_type_id, name", model_rows)
    insert(
        "inspection_reports",
        "id, code, sequence, report_date, action_type, client_id, machine_type_id, model,"
        " shed, sector, gate, problem_type, quality_code_id, description,"
        " needs_checklist_update, immediate_action",
        report_rows,
    )
    insert(
        "inspection_report_employees",
        "inspection_report_id, employee_id, position",
        report_employee_rows,
    )
    insert(
        "machine_dispatches",
        "id, code, sequence, dispatch_date, client_id, machine_type_id, model, notes,"
        " needs_form_update, immediate_action",
        dispatch_rows,
    )
    insert(
        "machine_dispatch_employees",
        "machine_dispatch_id, employee_id, position",
        dispatch_employee_rows,
    )
    insert(
        "customer_complaints",
        "id, complaint_date, client_id, machine_type_id, model, problem, local_treatment,"
        " quality_alert, signatures",
        complaint_rows,
    )
    insert(
        "startup_problems",
        "id, occurred_on, client_id, machine_type_id, model, technician, problem,"
        " local_treatment, resolution",
        startup_rows,
    )
    statements.append(
        "\nINSERT INTO data_revisions (scope, revision, updated_at) "
        "VALUES ('quality', 1, CURRENT_TIMESTAMP) "
        "ON DUPLICATE KEY UPDATE revision = revision + 1, updated_at = CURRENT_TIMESTAMP;"
    )

    return statements, counts


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: python import_quality.py <planilha.xlsm> [saida.sql]")
        return 1

    source = Path(sys.argv[1])
    if not source.is_file():
        print(f"Planilha não encontrada: {source}")
        return 1

    destination = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).with_name("seed_quality.sql")
    statements, counts = build(source)
    destination.write_text("\n".join(statements) + "\n", encoding="utf-8")

    print(f"SQL gerado em {destination}")
    for name, total in counts.items():
        print(f"  {name:32} {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
