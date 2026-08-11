-- Atualiza solicitações antigas para o fluxo de identificação do colaborador.
ALTER TABLE access_requests
    ADD COLUMN IF NOT EXISTS sector VARCHAR(120) NULL AFTER name,
    ADD COLUMN IF NOT EXISTS job_title VARCHAR(120) NULL AFTER sector,
    ADD COLUMN IF NOT EXISTS admission_date DATE NULL AFTER job_title,
    MODIFY COLUMN email VARCHAR(254) NULL,
    MODIFY COLUMN password_hash VARCHAR(255) NULL;

CREATE INDEX IF NOT EXISTS access_requests_employee_status_index
    ON access_requests (name, admission_date, status);
