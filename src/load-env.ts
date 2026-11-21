/**
 * Charge le fichier .env avant tout autre module : la configuration des modules
 * (Redis facultatif, etc.) est lue au moment de leur import.
 */
try {
  process.loadEnvFile?.();
} catch {
  /* pas de .env : variables du système */
}
