# Known Issues and TODO

## Schema Mismatches

The backend services were created with assumed schema field names that don't match the actual Drizzle schemas generated from Supabase. These need to be corrected:

### WhatsApp Service Issues

1. **messages table** uses:
   - `message_id` (text) not `id`
   - `conversation_id` (uuid ref)
   - `external_id` should be `message_id`
   - No `file_name` field - should be part of metadata
   - No `updated_at` field - only `created_at`

2. **conversations table** uses:
   - `contact_id` not `contact_phone` directly
   - `last_message_preview` not `last_message`
   - No direct `contact_name` or `contact_phone` - must join with contacts table

### Auth Service Issues

1. **profiles table** doesn't have:
   - `password_hash` field - needs separate auth table or schema update
   - `role` field - roles are in `user_roles` table
   - `phone` field

### Fixes Needed

1. Add a `user_credentials` table to store passwords
2. Update WhatsApp service to:
   - Join with contacts table for phone/name
   - Use correct field names
   - Handle the many-to-many relationships properly
3. Update auth service to work with user_roles table correctly

## Workarounds

For now, the backend compiles with errors. To make it functional:

1. Either update the Drizzle schemas to match the service code
2. Or update the service code to match the schemas (recommended)

The schemas accurately reflect the Supabase database structure, so option 2 is better.

## Next Steps

1. Fix schema mismatches in services
2. Add password storage capability
3. Complete remaining Edge Function conversions
4. Update frontend hooks
5. Test end-to-end
