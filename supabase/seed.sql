-- Seed: create or update admin user
DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'admin@livechat.app';

  IF uid IS NULL THEN
    uid := gen_random_uuid();

    INSERT INTO auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at, is_super_admin, created_at, updated_at, instance_id
    ) VALUES (
      uid,
      'authenticated',
      'authenticated',
      'admin@livechat.app',
      crypt('livechat', gen_salt('bf')),
      now(),
      true,
      now(),
      now(),
      '00000000-0000-0000-0000-000000000000'
    );

    INSERT INTO public.profiles (id, full_name, email, is_approved, created_at, updated_at)
    VALUES (uid, 'Admin', 'admin@livechat.app', true, now(), now());

    INSERT INTO public.user_roles (user_id, role, created_at)
    VALUES (uid, 'admin', now());

    -- Create identity for email provider (so GoTrue recognizes the user)
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id)
    SELECT uid::text, uid, jsonb_build_object('sub', uid::text, 'email', 'admin@livechat.app', 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now(), gen_random_uuid()
    WHERE NOT EXISTS (
      SELECT 1 FROM auth.identities WHERE user_id = uid AND provider = 'email'
    );

    -- Set auth meta data and confirmed_at to mimic a signup-created user
    UPDATE auth.users
    SET raw_app_meta_data = jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
        raw_user_meta_data = jsonb_build_object('sub', uid::text, 'email', 'admin@livechat.app', 'email_verified', true, 'phone_verified', false)
    WHERE id = uid;

  ELSE
    -- Update password, email confirmation and super admin flag
    UPDATE auth.users
    SET encrypted_password = crypt('livechat', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        is_super_admin = true,
        updated_at = now(),
        role = 'authenticated',
        instance_id = '00000000-0000-0000-0000-000000000000'
    WHERE id = uid;

    -- Ensure profile exists and is approved
    INSERT INTO public.profiles (id, full_name, email, is_approved, created_at, updated_at)
    VALUES (uid, 'Admin', 'admin@livechat.app', true, now(), now())
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          email = EXCLUDED.email,
          is_approved = EXCLUDED.is_approved,
          updated_at = now();

    -- Ensure identity exists for email provider
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id)
    SELECT uid::text, uid, jsonb_build_object('sub', uid::text, 'email', 'admin@livechat.app', 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now(), gen_random_uuid()
    WHERE NOT EXISTS (
      SELECT 1 FROM auth.identities WHERE user_id = uid AND provider = 'email'
    );

    -- Ensure admin role exists
    INSERT INTO public.user_roles (user_id, role, created_at)
    SELECT uid, 'admin', now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = uid AND role = 'admin'
    );
  END IF;
END
$$ LANGUAGE plpgsql;

-- Seed: create regular user
DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'user@livechat.app';

  IF uid IS NULL THEN
    uid := gen_random_uuid();

    INSERT INTO auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at, is_super_admin, created_at, updated_at, instance_id
    ) VALUES (
      uid,
      'authenticated',
      'authenticated',
      'user@livechat.app',
      crypt('123456', gen_salt('bf')),
      now(),
      false,
      now(),
      now(),
      '00000000-0000-0000-0000-000000000000'
    );

    INSERT INTO public.profiles (id, full_name, email, is_approved, created_at, updated_at)
    VALUES (uid, 'Usuário Comum', 'user@livechat.app', true, now(), now());

    INSERT INTO public.user_roles (user_id, role, created_at)
    VALUES (uid, 'agent', now());

    -- Create identity for email provider
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id)
    SELECT uid::text, uid, jsonb_build_object('sub', uid::text, 'email', 'user@livechat.app', 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now(), gen_random_uuid()
    WHERE NOT EXISTS (
      SELECT 1 FROM auth.identities WHERE user_id = uid AND provider = 'email'
    );

    -- Set auth meta data 
    UPDATE auth.users
    SET raw_app_meta_data = jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
        raw_user_meta_data = jsonb_build_object('sub', uid::text, 'email', 'user@livechat.app', 'email_verified', true, 'phone_verified', false)
    WHERE id = uid;

  END IF;
END
$$ LANGUAGE plpgsql;
