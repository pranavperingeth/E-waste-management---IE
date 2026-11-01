CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- TABLE 1: registration (one row per client)
CREATE TABLE registrations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name        VARCHAR(100)  NOT NULL,
    email            VARCHAR(150)  NOT NULL UNIQUE,
    password_hash    TEXT          NOT NULL,
    whatsapp_number  VARCHAR(20)   NOT NULL UNIQUE,   -- digits only with country code, e.g. 919876543210
    default_address  TEXT,
    -- chatbot conversation memory (so we do not need a 4th table)
    chat_state       VARCHAR(20)   NOT NULL DEFAULT 'IDLE',
        -- IDLE | ASK_CATEGORY | ASK_QTY | ASK_ADDRESS | ASK_DATE | CONFIRM
    chat_context     JSONB         NOT NULL DEFAULT '{}'::jsonb,
    -- blocking
    is_blocked       BOOLEAN       NOT NULL DEFAULT FALSE,
    blocked_until    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- TABLE 2: bookings (pickup requests made via WhatsApp)
CREATE TABLE bookings (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_ref        VARCHAR(12)  NOT NULL UNIQUE,   -- e.g. EW-A1B2C3
    registration_id    UUID         NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    item_category      VARCHAR(40)  NOT NULL,
        -- phone | laptop | battery | appliance | cables | other
    quantity           INT          NOT NULL CHECK (quantity BETWEEN 1 AND 50),
    pickup_address     TEXT         NOT NULL,
    pickup_date        DATE         NOT NULL,
    status             VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
        -- PENDING | CONFIRMED | PICKED_UP | CANCELLED
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bookings_reg_created ON bookings(registration_id, created_at DESC);

-- TABLE 3: antispam_log (one row per event we check)
CREATE TABLE antispam_log (
    id               BIGSERIAL PRIMARY KEY,
    whatsapp_number  VARCHAR(20)  NOT NULL,
    registration_id  UUID REFERENCES registrations(id) ON DELETE SET NULL,  -- NULL if unknown number
    event_type       VARCHAR(20)  NOT NULL,
        -- MESSAGE | BOOKING | REGISTER
    action           VARCHAR(10)  NOT NULL,           -- ALLOWED | BLOCKED
    reason           VARCHAR(100),                    -- e.g. 'rate_limit', 'daily_booking_cap'
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_spam_number_time ON antispam_log(whatsapp_number, created_at DESC);
