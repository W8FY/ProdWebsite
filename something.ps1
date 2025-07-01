# ================================
# Generate Markdown for Gallery
# ================================

# Set the year to process
$year = "2019"

# Define input and output paths
$galleryPath = "assets/gallery/$year"
$outputDir = "content/gallerys"

# Ensure the output directory exists
if (!(Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Get all subfolders under the year folder
$folders = Get-ChildItem -Path $galleryPath -Directory

foreach ($folder in $folders) {
    $folderName = $folder.Name

    # Build output filename like '2013-foldername.md'
    $safeName = $folderName -replace '\s', '_'  # Replace spaces with underscores
    $outputFile = "$year-$safeName.md"
    $outputPath = Join-Path -Path $outputDir -ChildPath $outputFile

    # Format the title (replace underscores with spaces)
    $title = "$year - $($folderName -replace '_', ' ')"

    # Find image files in folder (jpg/jpeg/png)
    $imageFiles = Get-ChildItem -Path $folder.FullName -File | Where-Object {
        $_.Extension -match '\.jpe?g$|\.png$'
    }

    if ($imageFiles.Count -eq 0) {
        Write-Warning "⚠️ No image files found in $folderName — using fallback banner"
        $banner = "/gallery/$year/$folderName/cover.jpg"  # fallback placeholder
    } else {
        $randomImage = Get-Random -InputObject $imageFiles
        $bannerFile = $randomImage.Name
        $banner = "/gallery/$year/$folderName/$bannerFile"
    }

    # Generate the markdown content
    $mdContent = @"
+++
title = "$title"
date = "$year-01-01"
tags = ["$year", ""]
banner = "$banner"
description = "Photos from $title"
authors = ["David Freels - KA8ZGE"]
+++

{{< image-gallery gallery_dir="/gallery/$year/$folderName/" >}}
"@

    # Write to the markdown file
    $mdContent | Out-File -FilePath $outputPath -Encoding UTF8

    Write-Output "✅ Created $outputFile with banner $banner"
}

Write-Output "🎉 Markdown generation complete."
