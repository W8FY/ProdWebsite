<!DOCTYPE html>
<html lang="{{ .Site.LanguageCode }}">

  <head>
    {{ partial "headers.html" . }}
    {{ partial "custom_headers.html" . }}
  </head>
  <style>
  html *
  {
   font-size: 30px;
   Color: white;
  }
  </style>

  <body style="background-color:rgb(0, 0, 0);">
<center>
    <div>
     {{ .Content }}
    </div>
</center>

  </body>
</html>
