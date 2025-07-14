-- Create the 'users' table with enhanced security fields
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    refresh_token VARCHAR(255),
    refresh_token_expires_at TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for 'users' table
CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email ON users (email);

-- Create the 'roles' table
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL
);

-- Create the 'user_roles' junction table
CREATE TABLE user_roles (
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
);

-- Create indexes for 'user_roles' table
CREATE INDEX idx_user_roles_user_id ON user_roles (user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles (role_id);

-- Create the 'prompt_templates' table
CREATE TABLE prompt_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    template_string TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for 'prompt_templates' table
CREATE INDEX idx_prompt_templates_name ON prompt_templates (name);

-- Create the 'user_prompts' table (renamed from 'prompts')
CREATE TABLE user_prompts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    template_id INTEGER, -- Optional: references prompt_templates
    prompt_string TEXT NOT NULL,
    generated_output TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    tags TEXT[],
    metadata JSONB,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES prompt_templates (id) ON DELETE SET NULL
);

-- Create indexes for 'user_prompts' table
CREATE INDEX idx_user_prompts_user_id ON user_prompts (user_id);
CREATE INDEX idx_user_prompts_template_id ON user_prompts (template_id);
CREATE INDEX idx_user_prompts_created_at ON user_prompts (created_at);
CREATE INDEX idx_user_prompts_tags ON user_prompts USING GIN (tags);
CREATE INDEX idx_user_prompts_user_id_created_at_desc ON user_prompts (user_id, created_at DESC);

-- Create the 'prompt_versions' table
CREATE TABLE prompt_versions (
    id SERIAL PRIMARY KEY,
    prompt_id INTEGER NOT NULL,
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (prompt_id) REFERENCES user_prompts (id) ON DELETE CASCADE
);

-- Create indexes for 'prompt_versions' table
CREATE INDEX idx_prompt_versions_prompt_id ON prompt_versions (prompt_id);

-- Security enhancement tables

-- User sessions table for concurrent session management
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    refresh_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Login attempts tracking for security monitoring
CREATE TABLE login_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    username_attempt VARCHAR(50),
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    failure_reason VARCHAR(255),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Audit log table for comprehensive security logging
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id INTEGER,
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- Security events table for monitoring and alerting
CREATE TABLE security_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL, -- 'login_failed', 'password_change', 'session_expired', etc.
    user_id INTEGER,
    ip_address INET,
    user_agent TEXT,
    severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Enhanced indexes for security tables
CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_locked_until ON users (locked_until) WHERE locked_until IS NOT NULL;

CREATE INDEX idx_user_sessions_user_id ON user_sessions (user_id);
CREATE INDEX idx_user_sessions_refresh_token ON user_sessions (refresh_token);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions (expires_at);

CREATE INDEX idx_login_attempts_user_id ON login_attempts (user_id);
CREATE INDEX idx_login_attempts_ip_address ON login_attempts (ip_address);
CREATE INDEX idx_login_attempts_attempted_at ON login_attempts (attempted_at DESC);
CREATE INDEX idx_login_attempts_success ON login_attempts (success);

CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);

CREATE INDEX idx_security_events_user_id ON security_events (user_id);
CREATE INDEX idx_security_events_event_type ON security_events (event_type);
CREATE INDEX idx_security_events_severity ON security_events (severity);
CREATE INDEX idx_security_events_created_at ON security_events (created_at DESC);

-- Function to update the 'updated_at' column automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update 'updated_at' on UPDATE
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();