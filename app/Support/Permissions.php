<?php

declare(strict_types=1);

namespace App\Support;

final class Permissions
{
    /** @var array<string, array{group: string, label: string, description: string, assignable?: bool}> */
    public const DEFINITIONS = [
        'dashboard.view' => ['group' => 'Geral', 'label' => 'Acessar Dashboard', 'description' => 'Visualizar a tela inicial do sistema.'],
        'quality.view' => ['group' => 'Qualidade', 'assignable' => false, 'label' => 'Visualizar Qualidade', 'description' => 'Consultar indicadores, registros e documentos da Qualidade.'],
        'quality.edit' => ['group' => 'Qualidade', 'assignable' => false, 'label' => 'Editar registros da Qualidade', 'description' => 'Editar RAPs, produtos coletados e registros de satisfação, mantendo o histórico das alterações.'],
        'quality.manage' => ['group' => 'Qualidade', 'label' => 'Excluir registros da Qualidade', 'description' => 'Excluir RAPs, produtos coletados e registros de satisfação existentes.'],
        'quality.create_rap' => ['group' => 'Qualidade', 'label' => 'Criar novo RAP', 'description' => 'Exibir o botão Novo RAP e registrar apontamentos.'],
        'quality.create_dispatch' => ['group' => 'Qualidade', 'label' => 'Criar nova coleta', 'description' => 'Exibir o botão Nova coleta e registrar produtos coletados.'],
        'quality.create_complaint' => ['group' => 'Qualidade', 'label' => 'Registrar satisfação do cliente', 'description' => 'Exibir o botão de registro na aba Qualidade e lançar reclamações do cliente.'],
        'quality.import' => ['group' => 'Qualidade', 'label' => 'Importar planilha', 'description' => 'Importar e atualizar os dados da Qualidade por uma planilha Excel.'],
        'quality.raps' => ['group' => 'Qualidade', 'label' => 'RAPs', 'description' => 'Visualizar os indicadores de relatórios de ação preventiva.'],
        'quality.units' => ['group' => 'Qualidade', 'label' => 'Unidades', 'description' => 'Visualizar indicadores por barracão e gate.'],
        'quality.products' => ['group' => 'Qualidade', 'label' => 'Produtos', 'description' => 'Visualizar indicadores por máquina e modelo.'],
        'quality.dispatches' => ['group' => 'Qualidade', 'label' => 'Produtos Coletados', 'description' => 'Consultar coletas e expedições registradas.'],
        'quality.employees' => ['group' => 'Qualidade', 'label' => 'Colaboradores', 'description' => 'Visualizar os indicadores por colaborador.'],
        'quality.satisfaction' => ['group' => 'Qualidade', 'label' => 'Qualidade', 'description' => 'Visualizar satisfação e reclamações de clientes.'],
        'quality.records' => ['group' => 'Qualidade', 'label' => 'Registros', 'description' => 'Consultar a listagem de apontamentos registrados.'],
        'piperun.view' => ['group' => 'Sistemas externos', 'label' => 'Acessar PipeRun', 'description' => 'Exibir e utilizar o CRM PipeRun dentro do Infinity Desktop.'],
        'sige.view' => ['group' => 'Sistemas externos', 'label' => 'Acessar SIGE', 'description' => 'Exibir e utilizar o ERP SIGE dentro do Infinity Desktop.'],
        'users.manage' => ['group' => 'Administração', 'label' => 'Administrar usuários', 'description' => 'Criar contas e alterar cargos, status e permissões.'],
        'contact.manage' => ['group' => 'Administração', 'label' => 'Administrar ramais e contatos', 'description' => 'Editar a lista de ramais e os contatos gerais exibidos na Home.'],
    ];

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::DEFINITIONS);
    }

    /** @return list<string> */
    public static function assignableKeys(): array
    {
        return array_keys(array_filter(
            self::DEFINITIONS,
            static fn (array $definition): bool => ($definition['assignable'] ?? true) !== false
        ));
    }

    /** @return list<array<string, mixed>> */
    public static function definitions(): array
    {
        $definitions = [];

        foreach (self::DEFINITIONS as $key => $definition) {
            $definitions[] = ['key' => $key] + $definition;
        }

        return $definitions;
    }
}
