# Set your base path
$BasePath = "/Users/justinbrant/Repos/w8fy.brantlab.com/assets/gallery/2019"

# Define allowed image extensions
$ImageExtensions = @('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff')

Write-Host "Removing non-image files..."
# Find and remove non-image files
Get-ChildItem -Path $BasePath -Recurse -File | Where-Object {
    $ext = $_.Extension.ToLower()
    -not ($ImageExtensions -contains $ext)
} | ForEach-Object {
    Write-Host "Removing file: $($_.FullName)"
    Remove-Item $_.FullName -Force
}

Write-Host "Removing 'album' folders..."
# Find and remove 'album' folders
Get-ChildItem -Path $BasePath -Recurse -Directory | Where-Object {
    $_.Name -ieq 'album'
} | ForEach-Object {
    Write-Host "Removing folder: $($_.FullName)"
    Remove-Item $_.FullName -Recurse -Force
}

Write-Host "Cleanup complete."
