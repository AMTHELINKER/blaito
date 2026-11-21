/**
 * Charge le fichier d'environnement avant tout autre module : la configuration des
 * modules (Redis facultatif, etc.) est lue au moment de leur import.
 * Par défaut `.env` ; un autre fichier avec ENV_FILE (ex. ENV_FILE=.env.production).
 */
try {
  process.loadEnvFile?.(process.env.ENV_FILE ?? '.env');
} catch {
  /* pas de .env : variables du système */
}
