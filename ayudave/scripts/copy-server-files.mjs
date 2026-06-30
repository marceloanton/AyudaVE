import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");

await mkdir(dist, { recursive: true });
await cp(join(root, "api.php"), join(dist, "api.php"));
await cp(join(root, "cron-sync.php"), join(dist, "cron-sync.php"));
await cp(join(root, "config.sample.php"), join(dist, "config.sample.php"));
await cp(join(root, "README.md"), join(dist, "README.md"));
await cp(join(root, ".htaccess"), join(dist, ".htaccess"));
await cp(join(root, "robots.txt"), join(dist, "robots.txt"));
await cp(join(root, "sitemap.xml"), join(dist, "sitemap.xml"));
await cp(join(root, "sources.json"), join(dist, "sources.json"));
await cp(join(root, "ayudave-public-export.schema.json"), join(dist, "ayudave-public-export.schema.json"));
await cp(join(root, "openapi.json"), join(dist, "openapi.json"));
await cp(join(root, "llms.txt"), join(dist, "llms.txt"));
await cp(join(root, "ayuda-terremoto-venezuela.html"), join(dist, "ayuda-terremoto-venezuela.html"));
await cp(join(root, "como-reportar-ayuda-venezuela.html"), join(dist, "como-reportar-ayuda-venezuela.html"));
await cp(join(root, "directorio-ayuda-venezuela.html"), join(dist, "directorio-ayuda-venezuela.html"));
await cp(join(root, "datos-abiertos-ayudave.html"), join(dist, "datos-abiertos-ayudave.html"));
await mkdir(join(dist, "scripts"), { recursive: true });
await cp(join(root, "scripts", "sanitize-db.php"), join(dist, "scripts", "sanitize-db.php"));
await mkdir(join(dist, "data"), { recursive: true });
await cp(join(root, "data", ".htaccess"), join(dist, "data", ".htaccess"));
