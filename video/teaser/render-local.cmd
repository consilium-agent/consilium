@echo off
rem Renders this machine's share of the teaser and encodes each shot to an mp4.
set B="C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
set OUT=%~dp0frames
for %%S in (%*) do (
  %B% -b --factory-startup -P "%~dp0shots.py" -- --shot %%S --res 1280 --samples 24 --out "%OUT%" > "%OUT%\%%S.log" 2>&1
  ffmpeg -v error -y -framerate 30 -i "%OUT%\%%S\f_%%04d.png" -c:v libx264 -crf 14 -pix_fmt yuv420p "%OUT%\%%S.mp4"
)
echo done > "%OUT%\done-%COMPUTERNAME%.txt"
