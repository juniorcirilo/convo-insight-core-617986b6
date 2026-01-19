DO $$
DECLARE
  user_uuid uuid;
  identity_uuid uuid;
  encrypted_pw text;
BEGIN
  user_uuid := gen_random_uuid();
  identity_uuid := gen_random_uuid();
  encrypted_pw := crypt('123456', gen_salt('bf'));
  
  -- Insert into auth.users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, 
    email_confirmed_at, created_at, updated_at, 
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', user_uuid, 'authenticated', 'authenticated', 
    'user@livechat.app', encrypted_pw, NOW(), NOW(), NOW(), '', '', '', ''
  );
  
  -- Insert into auth.identities
  INSERT INTO auth.identities (
    identity_id, id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at, email
  ) VALUES (
    identity_uuid, user_uuid, user_uuid,
    format('{"sub":"%s","email":"%s","email_verified":true,"phone_verified":false}', user_uuid, 'user@livechat.app')::jsonb,
    'email', user_uuid::text, NOW(), NOW(), NOW(), 'user@livechat.app'
  );
  
  -- Insert into public.profiles
  INSERT INTO public.profiles (id, full_name, email, avatar_url, status, is_approved, created_at, updated_at) 
  VALUES (user_uuid, 'Usuário Comum', 'user@livechat.app', NULL, 'offline', true, NOW(), NOW());
  
  -- Insert into public.user_roles
  INSERT INTO public.user_roles (user_id, role, created_at, updated_at) 
  VALUES (user_uuid, 'agent', NOW(), NOW());
  
  RAISE NOTICE 'Usuário criado: user@livechat.app, senha: 123456, role: agent, UUID: %', user_uuid;
END
$$;