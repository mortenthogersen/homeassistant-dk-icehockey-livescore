# PowerShell script to download team logos
# Run this script from the project root directory

$baseUrl = "https://den.hokejovyzapis.cz/img/logos"
$outputDir = "team-logos"

# Create output directory if it doesn't exist
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
    Write-Host "Created directory: $outputDir"
}

# Download logos for teams 1-9
for ($i = 1; $i -le 9; $i++) {
    $url = "$baseUrl/$i.png"
    $outputFile = "$outputDir/$i.png"
    
    try {
        Write-Host "Downloading logo $i.png..."
        Invoke-WebRequest -Uri $url -OutFile $outputFile -UseBasicParsing
        Write-Host "  ✓ Saved to $outputFile"
    } catch {
        Write-Host "  ✗ Failed to download $url : $_" -ForegroundColor Red
    }
}

Write-Host "`nDownload complete! Copy the 'team-logos' folder to your Home Assistant www directory."
Write-Host "The logos will be accessible at: /local/team-logos/1.png, /local/team-logos/2.png, etc."
