CREATE POLICY "avatar_delete_policy" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'avatars'::text) AND (name = (auth.uid())::text) AND (NOT platform.is_profile_frozen(( SELECT auth.uid() AS uid)))));

CREATE POLICY "avatar_insert_policy" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH
    CHECK
    (((bucket_id = 'avatars'::text) AND (name = (auth.uid())::text) AND (path_tokens = ARRAY[(auth.uid())::text]) AND (NOT platform.is_profile_frozen(( SELECT auth.uid() AS
    uid)))));

CREATE POLICY "avatar_update_policy" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING
    (((bucket_id = 'avatars'::text) AND (name = (auth.uid())::text) AND (path_tokens = ARRAY[(auth.uid())::text]) AND (NOT platform.is_profile_frozen(( SELECT auth.uid() AS
    uid)))))
  WITH
    CHECK
    (((bucket_id = 'avatars'::text) AND (name = (auth.uid())::text) AND (path_tokens = ARRAY[(auth.uid())::text]) AND (NOT platform.is_profile_frozen(( SELECT auth.uid() AS
    uid)))));
