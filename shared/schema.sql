CREATE TABLE IF NOT EXISTS weld_records (
    line_no TEXT NOT NULL,
    weld_no TEXT NOT NULL,
    material_1 TEXT NOT NULL,
    material_2 TEXT NOT NULL,
    welded_on DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_model BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (line_no, weld_no)
);
CREATE INDEX IF NOT EXISTS weld_records_model_line_idx
    ON weld_records (line_no) WHERE is_model;
