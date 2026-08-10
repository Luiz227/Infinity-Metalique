-- Estrutura do setor de qualidade: RAPs, coletas, reclamações e tabelas de apoio.
-- Depende do banco criado por schema.sql.
USE infinity_metalique;

-- Clientes citados nos RAPs e nas coletas. Nos RAPs o campo às vezes traz o lote
-- em vez do nome ("46.7"), por isso o rótulo original é preservado em name.
CREATE TABLE IF NOT EXISTS clients (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(180) NOT NULL,
    -- Versão sem acentos duplicados nem caixa, usada só para evitar cadastro repetido.
    normalized_name VARCHAR(180) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY clients_normalized_name_unique (normalized_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Colaboradores da montagem, atribuídos aos apontamentos e às coletas.
CREATE TABLE IF NOT EXISTS employees (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(160) NOT NULL,
    normalized_name VARCHAR(160) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY employees_normalized_name_unique (normalized_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Códigos padronizados de não conformidade (COD 1 = parafuso solto, etc.).
CREATE TABLE IF NOT EXISTS quality_codes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(20) NOT NULL,
    description VARCHAR(255) NOT NULL,
    -- Preserva a ordem COD 1..COD 10 sem depender do texto do código.
    position INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY quality_codes_code_unique (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Linhas de produto: LASER, PLASMA, DOBRADEIRA, EMPILHADEIRA, SOLDA, GRAVADORA...
CREATE TABLE IF NOT EXISTS machine_types (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(60) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY machine_types_name_unique (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Modelos de cada linha, vindos da aba PRODUTOS da planilha.
CREATE TABLE IF NOT EXISTS machine_models (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    machine_type_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(80) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY machine_models_type_name_unique (machine_type_id, name),
    CONSTRAINT machine_models_type_foreign FOREIGN KEY (machine_type_id)
        REFERENCES machine_types (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Relatório de Apontamento (RAP), aberto quando a inspeção encontra não conformidade.
CREATE TABLE IF NOT EXISTS inspection_reports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    -- Número visível ao usuário (RAP01) e o inteiro que o gera, para calcular o próximo.
    code VARCHAR(20) NOT NULL,
    sequence INT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    -- Identificação do documento: CORREÇÃO ou RNC (a planilha antiga também traz CORRETIVA).
    action_type VARCHAR(30) NOT NULL,
    client_id BIGINT UNSIGNED NULL,
    machine_type_id BIGINT UNSIGNED NULL,
    model VARCHAR(80) NULL,
    shed VARCHAR(20) NULL,
    sector VARCHAR(40) NULL,
    gate VARCHAR(30) NULL,
    problem_type VARCHAR(60) NULL,
    quality_code_id BIGINT UNSIGNED NULL,
    description TEXT NULL,
    -- Abrangência da ação corretiva: se o apontamento exige mudar o checklist.
    needs_checklist_update TINYINT(1) NOT NULL DEFAULT 0,
    checklist_change TEXT NULL,
    immediate_action TEXT NULL,
    -- Reservado para a fila de verificação; hoje todo registro nasce liberado.
    status ENUM('registered', 'pending_review') NOT NULL DEFAULT 'registered',
    -- Nulo nos registros importados da planilha, preenchido no que nasce no sistema.
    created_by_user_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY inspection_reports_code_unique (code),
    UNIQUE KEY inspection_reports_sequence_unique (sequence),
    KEY inspection_reports_report_date_index (report_date),
    KEY inspection_reports_quality_code_index (quality_code_id),
    KEY inspection_reports_shed_gate_index (shed, gate),
    KEY inspection_reports_problem_type_index (problem_type),
    KEY inspection_reports_machine_type_index (machine_type_id),
    CONSTRAINT inspection_reports_client_foreign FOREIGN KEY (client_id)
        REFERENCES clients (id) ON DELETE SET NULL,
    CONSTRAINT inspection_reports_machine_type_foreign FOREIGN KEY (machine_type_id)
        REFERENCES machine_types (id) ON DELETE SET NULL,
    CONSTRAINT inspection_reports_quality_code_foreign FOREIGN KEY (quality_code_id)
        REFERENCES quality_codes (id) ON DELETE SET NULL,
    CONSTRAINT inspection_reports_user_foreign FOREIGN KEY (created_by_user_id)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Até três colaboradores por RAP. É esta tabela que sustenta o indicador individual:
-- um RAP com três pessoas gera três participações.
CREATE TABLE IF NOT EXISTS inspection_report_employees (
    inspection_report_id BIGINT UNSIGNED NOT NULL,
    employee_id BIGINT UNSIGNED NOT NULL,
    position TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (inspection_report_id, employee_id),
    KEY inspection_report_employees_employee_index (employee_id),
    CONSTRAINT inspection_report_employees_report_foreign FOREIGN KEY (inspection_report_id)
        REFERENCES inspection_reports (id) ON DELETE CASCADE,
    CONSTRAINT inspection_report_employees_employee_foreign FOREIGN KEY (employee_id)
        REFERENCES employees (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Relatório de Produto Coletado, preenchido na expedição da máquina.
CREATE TABLE IF NOT EXISTS machine_dispatches (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(20) NOT NULL,
    sequence INT UNSIGNED NOT NULL,
    dispatch_date DATE NOT NULL,
    client_id BIGINT UNSIGNED NULL,
    machine_type_id BIGINT UNSIGNED NULL,
    model VARCHAR(80) NULL,
    notes TEXT NULL,
    needs_form_update TINYINT(1) NOT NULL DEFAULT 0,
    form_change TEXT NULL,
    immediate_action TEXT NULL,
    created_by_user_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY machine_dispatches_code_unique (code),
    UNIQUE KEY machine_dispatches_sequence_unique (sequence),
    KEY machine_dispatches_dispatch_date_index (dispatch_date),
    KEY machine_dispatches_machine_type_index (machine_type_id),
    CONSTRAINT machine_dispatches_client_foreign FOREIGN KEY (client_id)
        REFERENCES clients (id) ON DELETE SET NULL,
    CONSTRAINT machine_dispatches_machine_type_foreign FOREIGN KEY (machine_type_id)
        REFERENCES machine_types (id) ON DELETE SET NULL,
    CONSTRAINT machine_dispatches_user_foreign FOREIGN KEY (created_by_user_id)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS machine_dispatch_employees (
    machine_dispatch_id BIGINT UNSIGNED NOT NULL,
    employee_id BIGINT UNSIGNED NOT NULL,
    position TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (machine_dispatch_id, employee_id),
    KEY machine_dispatch_employees_employee_index (employee_id),
    CONSTRAINT machine_dispatch_employees_dispatch_foreign FOREIGN KEY (machine_dispatch_id)
        REFERENCES machine_dispatches (id) ON DELETE CASCADE,
    CONSTRAINT machine_dispatch_employees_employee_foreign FOREIGN KEY (employee_id)
        REFERENCES employees (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mínimo de duas fotos por coleta registrada pelo sistema; os registros importados
-- da planilha não têm imagem porque a planilha nunca as armazenou.
CREATE TABLE IF NOT EXISTS machine_dispatch_photos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    machine_dispatch_id BIGINT UNSIGNED NOT NULL,
    path VARCHAR(255) NOT NULL,
    position TINYINT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY machine_dispatch_photos_dispatch_index (machine_dispatch_id),
    CONSTRAINT machine_dispatch_photos_dispatch_foreign FOREIGN KEY (machine_dispatch_id)
        REFERENCES machine_dispatches (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reclamações ligadas à expedição. Junto com as coletas formam a taxa de satisfação.
CREATE TABLE IF NOT EXISTS customer_complaints (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    complaint_date DATE NOT NULL,
    client_id BIGINT UNSIGNED NULL,
    machine_type_id BIGINT UNSIGNED NULL,
    model VARCHAR(80) NULL,
    problem TEXT NULL,
    local_treatment TEXT NULL,
    quality_alert VARCHAR(255) NULL,
    signatures VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY customer_complaints_complaint_date_index (complaint_date),
    CONSTRAINT customer_complaints_client_foreign FOREIGN KEY (client_id)
        REFERENCES clients (id) ON DELETE SET NULL,
    CONSTRAINT customer_complaints_machine_type_foreign FOREIGN KEY (machine_type_id)
        REFERENCES machine_types (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ocorrências registradas na partida da máquina no cliente (aba REGISTRO DE PROBLEMAS START).
CREATE TABLE IF NOT EXISTS startup_problems (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    occurred_on DATE NOT NULL,
    client_id BIGINT UNSIGNED NULL,
    machine_type_id BIGINT UNSIGNED NULL,
    model VARCHAR(80) NULL,
    technician VARCHAR(120) NULL,
    problem TEXT NULL,
    local_treatment TEXT NULL,
    resolution TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY startup_problems_occurred_on_index (occurred_on),
    CONSTRAINT startup_problems_client_foreign FOREIGN KEY (client_id)
        REFERENCES clients (id) ON DELETE SET NULL,
    CONSTRAINT startup_problems_machine_type_foreign FOREIGN KEY (machine_type_id)
        REFERENCES machine_types (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
