# ==========================
# Config
# ==========================
$zipUrl = "https://data.fcc.gov/download/pub/uls/complete/l_amat.zip"
$zipFile = "l_amat.zip"
$extractFolder = "fcc_extract"
$outputFile = "./content/hamlist/vanwert-hams.md"
$zipPrefixes = @('45891', '45832', '45898', '45863', '45838')

# Make sure output folder exists
$outputFolder = Split-Path $outputFile
if (-not (Test-Path $outputFolder)) {
    New-Item -ItemType Directory -Path $outputFolder | Out-Null
}

# ==========================
# Download FCC ZIP file
# ==========================
if (-Not (Test-Path $zipFile)) {
    Write-Host "Downloading FCC data..."
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile
} else {
    Write-Host "Using cached ZIP file."
}

# ==========================
# Extract ZIP
# ==========================
if (Test-Path $extractFolder) { Remove-Item $extractFolder -Recurse -Force }
Expand-Archive -Path $zipFile -DestinationPath $extractFolder

# ==========================
# Load EN.dat
# ==========================
$enFile = Get-ChildItem -Path $extractFolder -Filter "EN.dat" | Select-Object -First 1

if (-not $enFile) {
    Write-Error "EN.dat not found in the ZIP archive."
    exit
}

$lines = Get-Content $enFile.FullName

# ==========================
# City name correction map
# ==========================
$cityMap = @{
    "vanwert" = "Van Wert"
    "van wert" = "Van Wert"
    "ohio city" = "Ohio City"
    "convoy" = "Convoy"
    "willshire" = "Willshire"
    "middle point" = "Middle Point"
}

# ==========================
# Parse and Collect Entries
# ==========================
$entries = @()

foreach ($line in $lines) {
    $fields = $line -split '\|'

    $CallSign = ($fields[4] -replace '\|','').Trim().ToUpper()
    $EntityName = ($fields[7] -replace '\|','').Trim()
    $FirstName = ($fields[8] -replace '\|','').Trim()
    $LastName = ($fields[10] -replace '\|','').Trim()
    $CityRaw = ($fields[16] -replace '\|','').Trim()
    $ZipCodeRaw = ($fields[18] -replace '[^\d]', '').Trim()

    # Build ZIP prefix safely
    $Zip5 = if ($ZipCodeRaw.Length -ge 5) { $ZipCodeRaw.Substring(0,5) } else { $ZipCodeRaw }

    if ($zipPrefixes -contains $Zip5) {
        # Name formatting with Title Case
        if ($FirstName -and $LastName) {
            $NameParts = @($FirstName, $LastName)
        } elseif ($EntityName) {
            $NameParts = $EntityName -split '\s+'
        } else {
            $NameParts = @($CallSign)
        }

        $Name = ($NameParts | ForEach-Object {
            if ($_.Length -gt 0) {
                $_.Substring(0,1).ToUpper() + $_.Substring(1).ToLower()
            } else {
                ""
            }
        }) -join ' '

        # City formatting to Title Case
        $City = ($CityRaw -split '\s+') | ForEach-Object {
            if ($_.Length -gt 0) {
                $_.Substring(0,1).ToUpper() + $_.Substring(1).ToLower()
            } else {
                ""
            }
        }
        $City = $City -join ' '

        # Apply city correction map
        $CityLower = $City.ToLower()
        if ($cityMap.ContainsKey($CityLower)) {
            $City = $cityMap[$CityLower]
        }

        # Create entry object
        $entries += [PSCustomObject]@{
            CallSign = $CallSign
            Name     = $Name
            City     = $City
        }
    }
}

# ==========================
# Sort Entries Alphabetically by CallSign
# ==========================
$entries = $entries | Sort-Object -Property CallSign

# ==========================
# Write Markdown Table
# ==========================
@"
---
title: "Van Wert County Amateur Radio Operators"
date: 2025-06-30
draft: false
layout: ham-single
---

### List of licensed amateur radio operators in Van Wert County, Ohio. This data is sourced from the FCC Universal Licensing System.


| Call Sign | Name         | City         |
|-----------|--------------|--------------|
"@ | Out-File -FilePath $outputFile -Encoding utf8

foreach ($entry in $entries) {
    "| $($entry.CallSign) | $($entry.Name) | $($entry.City) |" | Out-File -FilePath $outputFile -Append -Encoding utf8
}

Write-Host "✅ Markdown generation complete. File is $outputFile"

# ==========================
# Cleanup ZIP and Extracted Files
# ==========================
Remove-Item $zipFile -Force
Remove-Item $extractFolder -Recurse -Force

Write-Host "🧹 Cleanup complete. ZIP and extracted files removed."
