
-- Update handle_new_user to read requested role from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _role app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  -- Read requested role from signup metadata; default to customer. Admin cannot be self-assigned.
  BEGIN
    _role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'requested_role','')::app_role, 'customer'::app_role);
  EXCEPTION WHEN OTHERS THEN
    _role := 'customer'::app_role;
  END;
  IF _role = 'admin'::app_role THEN
    _role := 'customer'::app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

-- Attach trigger to auth.users if not present
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Allow authenticated users to insert their own non-admin role (fallback if trigger missed)
DROP POLICY IF EXISTS "Users self insert role" ON public.user_roles;
CREATE POLICY "Users self insert role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role <> 'admin'::app_role);
