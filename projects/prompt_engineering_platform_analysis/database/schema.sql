-- Create the 'users' table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    refresh_token VARCHAR(255),
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