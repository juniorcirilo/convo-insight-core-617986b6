-- ============================================================
-- Script para remover usuários órfãos (sem profile)
-- Esses usuários tentaram se cadastrar antes do trigger existir
-- ============================================================

-- 1. Primeiro, visualizar os usuários que serão removidos
SELECT 
    au.id, 
    au.email, 
    au.created_at,
    'SERÁ REMOVIDO' as status
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;

-- 2. Remover as identidades dos usuários órfãos
DELETE FROM auth.identities
WHERE user_id IN (
    SELECT au.id 
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
);

-- 3. Remover as sessões dos usuários órfãos
DELETE FROM auth.sessions
WHERE user_id IN (
    SELECT au.id 
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
);

-- 4. Remover refresh tokens dos usuários órfãos
DELETE FROM auth.refresh_tokens
WHERE user_id IN (
    SELECT au.id 
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
);

-- 5. Finalmente, remover os usuários órfãos
DELETE FROM auth.users
WHERE id IN (
    SELECT au.id 
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
);

-- 6. Confirmar que não há mais usuários órfãos
SELECT 
    COUNT(*) as usuarios_orfaos_restantes
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;
