Param()

# Prompt for Spotify credentials and write a local .env (not committed).
$projectRoot = Resolve-Path "$PSScriptRoot/.."
$envPath = Join-Path $projectRoot ".env"
Write-Host "This will create or overwrite $envPath with your Spotify credentials (will not be committed)."
$confirm = Read-Host "Proceed? (y/n)"
if ($confirm -ne 'y') { Write-Host "Aborting."; exit 1 }

$clientId = Read-Host "SPOTIFY_CLIENT_ID"
$clientSecretSecure = Read-Host -AsSecureString "SPOTIFY_CLIENT_SECRET"

# Convert SecureString to plain text for writing to file (local only).
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($clientSecretSecure)
try {
    $clientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$content = "SPOTIFY_CLIENT_ID=$clientId`nSPOTIFY_CLIENT_SECRET=$clientSecret`n"
Set-Content -Path $envPath -Value $content -Encoding UTF8
Write-Host ".env written to $envPath"