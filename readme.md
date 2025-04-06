# 旧字体アドオン
webサイト上で表示される漢字を旧字体にします。  
  
弁論⇒辯論、弁慶⇒辨慶といった、新字体で統合された字種の書き換えにも対応。  

## FireFoxで使う場合
manifest.json
```
"background": {
    "service_worker": "background.js"
},

```
を
```
"background": {
  "scripts": ["background.js"]
},
```
に書き換えてください。