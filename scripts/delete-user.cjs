const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2] || "rjleoalves@gmail.com";

const c = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

(async () => {
  const { data } = await c.auth.admin.listUsers();
  const user = data.users.find((u) => u.email === email);
  if (!user) {
    console.log("No user found with email:", email);
    return;
  }
  console.log("Found:", user.id, user.email);

  const { data: memberships } = await c
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id);

  for (const m of memberships || []) {
    await c.from("clinics").delete().eq("id", m.clinic_id);
    console.log("Deleted clinic:", m.clinic_id);
  }

  await c.auth.admin.deleteUser(user.id);
  console.log("Deleted user. Ready for fresh signup.");
})();
