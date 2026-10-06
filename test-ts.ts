import { getDict } from "@/lib/i18n/server";
async function test() {
  const { t } = await getDict();
  console.log(t.nav.profile);
}