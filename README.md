# Calligraphy

An AR handwriting tutor for Snap Spectacles that teaches capital letters A, B, and C. It draws each letter for you, stroke by stroke, then watches you trace it in the air and tells you what to fix.

**Demo video:** https://youtu.be/q4SrO5GDG3M

## What it does

Two ruled slates sit side by side in front of you — a Learn box that draws each letter stroke by stroke, and a Practice box where you copy it by pinching in the air. When you finish, you get an accuracy score, a dashed ghost overlay showing where you drifted, and one plain-language note on what to fix ("crossbar sits too high").

It also adapts to how you're doing: a full ghost outline while you're still learning a letter, fading down to just a start dot, then nothing once you've shown you don't need it — and it steps back up if you slip.

## Try it

Open `Calligraphy.esproj` in Lens Studio and press Preview. It opens straight into the lesson on letter A, no menu. Draw with a mouse in Preview, or pinch to write on a Spectacles device.

## Built with

TypeScript and the Spectacles Interaction Kit, in Lens Studio.
