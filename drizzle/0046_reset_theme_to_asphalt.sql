-- Reset garageOsThemePreset to industrial-garage (asphalt) across all outlets.
UPDATE app_settings
SET value_json = '"industrial-garage"',
    updated_at = now()
WHERE key = 'garageOsThemePreset';
