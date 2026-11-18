import json, os, sys
s = open('shell.html').read()
s = s.replace('/*DATA*/', open('data.js').read()).replace('/*APP*/', open('app.js').read())
open('index.html', 'w').write(s)
# python3 build.py snapshot.json → preview.html med inbäddade realtidspositioner
if len(sys.argv) > 1:
    snap = open(sys.argv[1]).read()
    open('preview.html', 'w').write(s.replace('<script>', '<script>window.SNAPSHOT=' + snap + ';</script>\n<script>', 1))
