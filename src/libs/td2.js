(function ThreeDLib() {
'use strict';

/* ══════════════════════════════════════════════════════════════════════════════
   DUAL-MODE 3D LIBRARY  —  threeD.zl
   • Browser  : original implementation — DOM canvas, requestAnimationFrame,
                syntax-highlighter patch (all unchanged)
   • Node CLI : node-canvas for colour parsing, setInterval render loop,
                no MutationObserver / DOM dependency

   CLI install:  npm install canvas
   ══════════════════════════════════════════════════════════════════════════════ */

if (typeof DSALibraries === 'undefined') return;

const _isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

DSALibraries['threeD.zl'] = {
  description: 'Software 3D renderer for ZETA++ — meshes, lights, materials, scene graph, camera, raycasting',

  inject(G) {

    /* ── ZPP built-in registration (browser only) ── */
    if (_isBrowser && typeof window !== 'undefined' && window.__ZPP__) {
      window.__ZPP__.registerBuiltins([
        'Forge3D',
        'tdMesh', 'tdCube', 'tdSphere', 'tdPlane', 'tdCylinder', 'tdCone', 'tdTorus',
        'tdScene3D',
        'tdCamera',
        'tdPointLight', 'tdDirLight', 'tdAmbientLight',
        'tdMaterial',
        'tdVec3', 'tdVec3Add', 'tdVec3Sub', 'tdVec3Scale', 'tdVec3Dot', 'tdVec3Cross',
        'tdVec3Norm', 'tdVec3Len', 'tdVec3Lerp', 'tdVec3Reflect',
        'tdMat4Identity', 'tdMat4Mul', 'tdMat4TranslateM', 'tdMat4RotX', 'tdMat4RotY', 'tdMat4RotZ', 'tdMat4ScaleM',
        'tdRaycast', 'tdPickObject',
        'tdFogLinear', 'tdFogExp',
        'tdLoadOBJ',
        'tdSnapshot',
      ], 'td');

      window.__ZPP__.registerTypes(['mesh3d', 'scene3d', 'cam3d', 'light3d', 'mat3d']);

      /* Syntax-highlighter patch — browser-only, DOM-dependent */
      _patchHighlighter();
    }

    /* ════════════════════════════════════════════════════════════════════════
       SYNTAX HIGHLIGHTER PATCH  (browser only — untouched)
       ════════════════════════════════════════════════════════════════════════ */
    function _patchHighlighter() {
      const TD_COLORS = {};
      const _add = (color, tokens) => tokens.forEach(t => { TD_COLORS[t] = color; });

      _add('#ff79c6', ['Forge3D']);
      _add('#ffb86c', ['tdMesh','tdCube','tdSphere','tdPlane','tdCylinder',
                       'tdCone','tdTorus','tdLoadOBJ','tdMerge']);
      _add('#8be9fd', ['tdScene3D']);
      _add('#50fa7b', ['tdCamera']);
      _add('#f1fa8c', ['tdPointLight','tdDirLight','tdAmbientLight']);
      _add('#ff5555', ['tdMaterial']);
      _add('#bd93f9', ['tdVec3','tdVec3Add','tdVec3Sub','tdVec3Scale',
                       'tdVec3Dot','tdVec3Cross','tdVec3Norm','tdVec3Len',
                       'tdVec3Lerp','tdVec3Reflect',
                       'tdMat4Identity','tdMat4Mul','tdMat4TranslateM',
                       'tdMat4RotX','tdMat4RotY','tdMat4RotZ','tdMat4ScaleM']);
      _add('#e2b8ff', ['tdRaycast','tdPickObject','tdFogLinear','tdFogExp',
                       'tdSnapshot','tdStart','tdStop']);
      _add('#a8e6a3', ['tdPlace','tdSpin','tdGrow','tdColor','tdWire','tdSmooth',
                       'tdFlat','tdFace','tdEdge','tdOpacity','tdAttach','tdDetach',
                       'tdLook','tdOrbit','tdPan','tdTilt','tdRoll','tdFov',
                       'tdNear','tdFar','tdOrtho','tdPersp','tdAim',
                       'tdRender','tdTick','tdBackground3D','tdFog',
                       'tdAddMesh','tdRemoveMesh','tdGetMesh','tdClearScene',
                       'tdAddLight','tdRemoveLight','tdGetBounds','tdClone',
                       'tdFlipNormals','tdUVScale','tdCastShadow','tdReceiveShadow',
                       'tdVisible','tdTag','tdFindByTag','tdBright','tdOn','tdOff']);
      _add('#90e0ef', ['mesh3d','scene3d','cam3d','light3d','mat3d']);

      if (!window.__ZPP_TOKEN_PLUGINS__) window.__ZPP_TOKEN_PLUGINS__ = {};
      Object.assign(window.__ZPP_TOKEN_PLUGINS__, TD_COLORS);

      if (!document.getElementById('zpp-td-style')) {
        const style = document.createElement('style');
        style.id = 'zpp-td-style';
        const uniq = {};
        Object.entries(TD_COLORS).forEach(([,c]) => { uniq[c]=1; });
        style.textContent = Object.keys(uniq)
          .map(c => `.zpp-td-${c.replace('#','')}{ color:${c}; font-weight:600; }`)
          .join('\n');
        document.head.appendChild(style);
      }

      const _esc2 = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const _tdPattern = new RegExp(
        '(?:(?<=>)|(?<=^)|(?<=[^a-zA-Z0-9_]))(' +
        Object.keys(TD_COLORS).sort((a,b)=>b.length-a.length).join('|') +
        ')(?=[^a-zA-Z0-9_]|$|<)',
        'g'
      );

      function _recolorPre(pre) {
        pre.innerHTML = pre.innerHTML.replace(
          /(<span style="color:#f8f8f2">)([^<]+)(<\/span>)/g,
          (match, open, text, close) => {
            const replaced = text.replace(_tdPattern, (tok) => {
              const col = TD_COLORS[tok];
              return col ? `</span><span style="color:${col};font-weight:600">${_esc2(tok)}<span style="color:#f8f8f2">` : tok;
            });
            return replaced === text ? match : open + replaced + close;
          }
        );
      }

      let _recolorTimer = null;
      function _scheduleRecolor() {
        clearTimeout(_recolorTimer);
        _recolorTimer = setTimeout(() => {
          const pre = document.getElementById('zpp-highlight');
          if (pre) _recolorPre(pre);
        }, 30);
      }

      const _obs = new MutationObserver(_scheduleRecolor);
      function _watchPre() {
        const pre = document.getElementById('zpp-highlight');
        if (pre) { _obs.observe(pre, { childList:true, subtree:true }); _recolorPre(pre); }
        else setTimeout(_watchPre, 200);
      }
      setTimeout(_watchPre, 100);
    }

    /* ════════════════════════════════════════════════════════════════════════
       COLOUR PARSING  — uses DOM canvas in browser, node-canvas in Node
       ════════════════════════════════════════════════════════════════════════ */

    const _colorCache = new Map();
    let   _colorCtx   = null;

    function _initColorCtx() {
      if (_colorCtx) return;
      try {
        if (_isBrowser) {
          const c = document.createElement('canvas');
          c.width = c.height = 1;
          _colorCtx = c.getContext('2d');
        } else {
          const { createCanvas: _cn } = require('canvas');
          const c = _cn(1, 1);
          _colorCtx = c.getContext('2d');
        }
      } catch(e) {
        _colorCtx = null; // will use hex-only fallback
      }
    }

    function _parseColor(c) {
      if (!c || c==='none') return null;
      if (_colorCache.has(c)) return _colorCache.get(c);

      _initColorCtx();

      let rgb;
      if (_colorCtx) {
        _colorCtx.clearRect(0,0,1,1);
        _colorCtx.fillStyle = c;
        _colorCtx.fillRect(0,0,1,1);
        const d = _colorCtx.getImageData(0,0,1,1).data;
        rgb = {r:d[0]/255, g:d[1]/255, b:d[2]/255};
      } else {
        /* Hex-only fallback for environments without canvas */
        const hex = c.replace('#','');
        if (hex.length === 3) {
          rgb = {
            r: parseInt(hex[0]+hex[0],16)/255,
            g: parseInt(hex[1]+hex[1],16)/255,
            b: parseInt(hex[2]+hex[2],16)/255,
          };
        } else if (hex.length === 6) {
          const n = parseInt(hex,16);
          rgb = {r:((n>>16)&255)/255, g:((n>>8)&255)/255, b:(n&255)/255};
        } else {
          rgb = {r:0.8, g:0.8, b:0.8};
        }
      }

      _colorCache.set(c, rgb);
      return rgb;
    }

    /* ════════════════════════════════════════════════════════════════════════
       MATH UTILITIES  (unchanged)
       ════════════════════════════════════════════════════════════════════════ */

    const _DEG = Math.PI / 180;

    function _v3(x,y,z) { return {x:x||0, y:y||0, z:z||0}; }
    function _v3add(a,b) { return _v3(a.x+b.x, a.y+b.y, a.z+b.z); }
    function _v3sub(a,b) { return _v3(a.x-b.x, a.y-b.y, a.z-b.z); }
    function _v3scl(a,s) { return _v3(a.x*s, a.y*s, a.z*s); }
    function _v3dot(a,b) { return a.x*b.x + a.y*b.y + a.z*b.z; }
    function _v3cross(a,b){ return _v3(a.y*b.z-a.z*b.y, a.z*b.x-a.x*b.z, a.x*b.y-a.y*b.x); }
    function _v3len(a)   { return Math.sqrt(a.x*a.x+a.y*a.y+a.z*a.z); }
    function _v3norm(a)  { const l=_v3len(a)||1e-9; return _v3(a.x/l,a.y/l,a.z/l); }
    function _v3lerp(a,b,t){ return _v3(a.x+(b.x-a.x)*t, a.y+(b.y-a.y)*t, a.z+(b.z-a.z)*t); }
    function _v3refl(v,n){ const d=2*_v3dot(v,n); return _v3sub(v,_v3scl(n,d)); }

    function _m4id() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
    function _m4mul(a,b) {
      const r=[];
      for(let i=0;i<4;i++) for(let j=0;j<4;j++) {
        r[i*4+j]=0;
        for(let k=0;k<4;k++) r[i*4+j]+=a[i*4+k]*b[k*4+j];
      }
      return r;
    }
    function _m4trans(tx,ty,tz) { const m=_m4id(); m[12]=tx; m[13]=ty; m[14]=tz; return m; }
    function _m4scale(sx,sy,sz) { const m=_m4id(); m[0]=sx; m[5]=sy; m[10]=sz; return m; }
    function _m4rotX(deg) {
      const c=Math.cos(deg*_DEG), s=Math.sin(deg*_DEG);
      const m=_m4id(); m[5]=c; m[6]=-s; m[9]=s; m[10]=c; return m;
    }
    function _m4rotY(deg) {
      const c=Math.cos(deg*_DEG), s=Math.sin(deg*_DEG);
      const m=_m4id(); m[0]=c; m[2]=s; m[8]=-s; m[10]=c; return m;
    }
    function _m4rotZ(deg) {
      const c=Math.cos(deg*_DEG), s=Math.sin(deg*_DEG);
      const m=_m4id(); m[0]=c; m[1]=-s; m[4]=s; m[5]=c; return m;
    }
    function _applyM4(m,v) {
      const w = m[3]*v.x+m[7]*v.y+m[11]*v.z+m[15]||1;
      return _v3(
        (m[0]*v.x+m[4]*v.y+m[8]*v.z +m[12])/w,
        (m[1]*v.x+m[5]*v.y+m[9]*v.z +m[13])/w,
        (m[2]*v.x+m[6]*v.y+m[10]*v.z+m[14])/w
      );
    }

    function _rebuildWorldMatrix(node) {
      let m = _m4id();
      m = _m4mul(_m4trans(node._px, node._py, node._pz), m);
      m = _m4mul(_m4rotY(node._ry), m);
      m = _m4mul(_m4rotX(node._rx), m);
      m = _m4mul(_m4rotZ(node._rz), m);
      m = _m4mul(_m4scale(node._sx, node._sy, node._sz), m);
      node._world = m;
    }

    function _colorToHex(r,g,b) {
      const clamp = v => Math.max(0,Math.min(255,Math.round(v*255)));
      return '#'+[clamp(r),clamp(g),clamp(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
    }

    function _shadeColor(baseRGB, intensity) {
      return _colorToHex(baseRGB.r*intensity, baseRGB.g*intensity, baseRGB.b*intensity);
    }

    /* ════════════════════════════════════════════════════════════════════════
       MESH  (unchanged)
       ════════════════════════════════════════════════════════════════════════ */

    function _makeMeshNode() {
      return {
        __tdType__: 'mesh',
        _verts: [], _faces: [], _normals: [],
        _px:0,_py:0,_pz:0,
        _rx:0,_ry:0,_rz:0,
        _sx:1,_sy:1,_sz:1,
        _world: _m4id(),
        _dirty: true,
        _material: null,
        _visible: true,
        _castShadow: false,
        _recvShadow: false,
        _tag: '',
        _children: [],
        _cachedColor: null,
      };
    }

    function _buildMeshAPI(node) {
      node.tdPlace    = (x,y,z)   => { node._px=x||0; node._py=y||0; node._pz=z||0; node._dirty=true; return node; };
      node.tdSpin     = (rx,ry,rz)=> { node._rx=rx||0; node._ry=ry||0; node._rz=rz||0; node._dirty=true; return node; };
      node.tdGrow     = (sx,sy,sz)=> { node._sx=sx||1; node._sy=sy===undefined?sx:sy; node._sz=sz===undefined?sx:sz; node._dirty=true; return node; };
      node.tdColor    = c         => { if(!node._material)node._material={color:'#ffffff',wire:false,smooth:true,opacity:1,uvScale:1}; node._material.color=c; node._cachedColor=null; return node; };
      node.tdWire     = b         => { if(!node._material)node._material={color:'#ffffff',wire:false,smooth:true,opacity:1,uvScale:1}; node._material.wire=b!==false; return node; };
      node.tdSmooth   = b         => { if(!node._material)node._material={color:'#ffffff',wire:false,smooth:true,opacity:1,uvScale:1}; node._material.smooth=b!==false; return node; };
      node.tdFlat     = ()        => { if(!node._material)node._material={color:'#ffffff',wire:false,smooth:true,opacity:1,uvScale:1}; node._material.smooth=false; return node; };
      node.tdOpacity  = a         => { if(!node._material)node._material={color:'#ffffff',wire:false,smooth:true,opacity:1,uvScale:1}; node._material.opacity=a; return node; };
      node.tdFace     = c         => { if(!node._material)node._material={color:'#ffffff',wire:false,smooth:true,opacity:1,uvScale:1}; node._material.faceColor=c; return node; };
      node.tdEdge     = c         => { if(!node._material)node._material={color:'#ffffff',wire:false,smooth:true,opacity:1,uvScale:1}; node._material.edgeColor=c; return node; };
      node.tdUVScale  = s         => { if(!node._material)node._material={color:'#ffffff',wire:false,smooth:true,opacity:1,uvScale:1}; node._material.uvScale=s||1; return node; };
      node.tdCastShadow    = b    => { node._castShadow=b!==false; return node; };
      node.tdReceiveShadow = b    => { node._recvShadow=b!==false; return node; };
      node.tdVisible  = b         => { node._visible=b!==false; return node; };
      node.tdTag      = t         => { node._tag=String(t); return node; };
      node.tdAttach   = child     => { node._children.push(child); return node; };
      node.tdDetach   = child     => { node._children=node._children.filter(c=>c!==child); return node; };
      node.tdGetBounds= ()        => {
        let mnx=Infinity,mny=Infinity,mnz=Infinity,mxx=-Infinity,mxy=-Infinity,mxz=-Infinity;
        node._verts.forEach(v=>{
          const w=_applyM4(node._world,v);
          if(w.x<mnx)mnx=w.x; if(w.x>mxx)mxx=w.x;
          if(w.y<mny)mny=w.y; if(w.y>mxy)mxy=w.y;
          if(w.z<mnz)mnz=w.z; if(w.z>mxz)mxz=w.z;
        });
        return {min:_v3(mnx,mny,mnz), max:_v3(mxx,mxy,mxz), center:_v3((mnx+mxx)/2,(mny+mxy)/2,(mnz+mxz)/2)};
      };
      node.tdClone = () => {
        const c = _makeMeshNode();
        c._verts  = node._verts.map(v=>_v3(v.x,v.y,v.z));
        c._faces  = node._faces.map(f=>[...f]);
        c._normals= node._normals.map(n=>_v3(n.x,n.y,n.z));
        c._px=node._px; c._py=node._py; c._pz=node._pz;
        c._rx=node._rx; c._ry=node._ry; c._rz=node._rz;
        c._sx=node._sx; c._sy=node._sy; c._sz=node._sz;
        if(node._material)c._material=Object.assign({},node._material);
        _rebuildWorldMatrix(c);
        _buildMeshAPI(c);
        return c;
      };
      node.tdFlipNormals = () => {
        node._normals = node._normals.map(n=>_v3(-n.x,-n.y,-n.z));
        node._faces   = node._faces.map(f=>[f[0],f[2],f[1],...f.slice(3)]);
        return node;
      };
      _rebuildWorldMatrix(node);
      return node;
    }

    function _computeFaceNormals(node) {
      node._normals = node._faces.map(f => {
        const a=node._verts[f[0]], b=node._verts[f[1]], c=node._verts[f[2]];
        return _v3norm(_v3cross(_v3sub(b,a),_v3sub(c,a)));
      });
    }

    /* ════════════════════════════════════════════════════════════════════════
       GEOMETRY GENERATORS  (unchanged)
       ════════════════════════════════════════════════════════════════════════ */

    function _genCubeGeom(w,h,d) {
      w=w||1; h=h||1; d=d||1;
      const hx=w/2,hy=h/2,hz=d/2;
      const v=[
        _v3(-hx,-hy,-hz),_v3( hx,-hy,-hz),_v3( hx, hy,-hz),_v3(-hx, hy,-hz),
        _v3(-hx,-hy, hz),_v3( hx,-hy, hz),_v3( hx, hy, hz),_v3(-hx, hy, hz),
      ];
      const f=[
        [0,1,2,3],[5,4,7,6],[4,0,3,7],
        [1,5,6,2],[3,2,6,7],[4,5,1,0],
      ];
      return {v,f};
    }

    function _genSphereGeom(r,segs,rings) {
      r=r||1; segs=segs||16; rings=rings||12;
      const v=[], f=[];
      for(let ri=0;ri<=rings;ri++){
        const phi=Math.PI*ri/rings;
        for(let si=0;si<=segs;si++){
          const theta=2*Math.PI*si/segs;
          v.push(_v3(r*Math.sin(phi)*Math.cos(theta), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(theta)));
        }
      }
      const w2=segs+1;
      for(let ri=0;ri<rings;ri++) for(let si=0;si<segs;si++){
        const a=ri*w2+si, b=a+1, c=a+w2, d=c+1;
        f.push([a,b,d,c]);
      }
      return {v,f};
    }

    function _genPlaneGeom(w,h,segW,segH) {
      w=w||1; h=h||1; segW=segW||1; segH=segH||1;
      const v=[], f=[];
      for(let j=0;j<=segH;j++) for(let i=0;i<=segW;i++)
        v.push(_v3((i/segW-.5)*w, 0, (j/segH-.5)*h));
      const sw=segW+1;
      for(let j=0;j<segH;j++) for(let i=0;i<segW;i++){
        const a=j*sw+i; f.push([a,a+1,a+sw+1,a+sw]);
      }
      return {v,f};
    }

    function _genCylinderGeom(rTop,rBot,h,segs) {
      rTop=rTop||.5; rBot=rBot||.5; h=h||1; segs=segs||16;
      const v=[], f=[];
      const hy=h/2;
      for(let i=0;i<=segs;i++){
        const theta=2*Math.PI*i/segs;
        const c=Math.cos(theta), s=Math.sin(theta);
        v.push(_v3(rBot*c,-hy,rBot*s));
        v.push(_v3(rTop*c, hy,rTop*s));
      }
      const sw=2;
      for(let i=0;i<segs;i++){
        const a=i*sw, b=a+1, c=a+sw, d=c+1;
        f.push([a,c,d,b]);
      }
      const bcenter=v.length; v.push(_v3(0,-hy,0));
      const tcenter=v.length; v.push(_v3(0, hy,0));
      for(let i=0;i<segs;i++){
        f.push([bcenter, i*sw+sw, i*sw]);
        f.push([tcenter, i*sw+1, i*sw+sw+1]);
      }
      return {v,f};
    }

    function _genConeGeom(r,h,segs) {
      r=r||.5; h=h||1; segs=segs||16;
      const v=[], f=[];
      const hy=h/2;
      for(let i=0;i<=segs;i++){
        const theta=2*Math.PI*i/segs;
        v.push(_v3(r*Math.cos(theta),-hy,r*Math.sin(theta)));
      }
      const tip=v.length; v.push(_v3(0,hy,0));
      const base=v.length; v.push(_v3(0,-hy,0));
      for(let i=0;i<segs;i++){
        f.push([i,i+1,tip]);
        f.push([base,i+1,i]);
      }
      return {v,f};
    }

    function _genTorusGeom(R,r,segs,tube) {
      R=R||.5; r=r||.2; segs=segs||24; tube=tube||12;
      const v=[], f=[];
      for(let i=0;i<=segs;i++){
        const u=2*Math.PI*i/segs, cu=Math.cos(u), su=Math.sin(u);
        for(let j=0;j<=tube;j++){
          const ww=2*Math.PI*j/tube;
          const cv=Math.cos(ww), sv=Math.sin(ww);
          v.push(_v3((R+r*cv)*cu, r*sv, (R+r*cv)*su));
        }
      }
      const tw=tube+1;
      for(let i=0;i<segs;i++) for(let j=0;j<tube;j++){
        const a=i*tw+j, b=a+1, c=a+tw, d=c+1;
        f.push([a,b,d,c]);
      }
      return {v,f};
    }

    function _buildMeshFromGeom(geo) {
      const node = _makeMeshNode();
      node._verts = geo.v;
      node._faces = geo.f.map(face=>{
        const tris=[];
        for(let i=1;i<face.length-1;i++) tris.push([face[0],face[i],face[i+1]]);
        return tris;
      }).flat();
      _computeFaceNormals(node);
      node._material = {color:'#cccccc',wire:false,smooth:true,opacity:1,uvScale:1};
      _buildMeshAPI(node);
      return node;
    }

    /* ════════════════════════════════════════════════════════════════════════
       CAMERA  (unchanged)
       ════════════════════════════════════════════════════════════════════════ */

    function _makeCamera() {
      const cam = {
        __tdType__: 'camera',
        _pos: _v3(0,0,5),
        _target: _v3(0,0,0),
        _up: _v3(0,1,0),
        _fov: 60,
        _near: 0.1,
        _far: 1000,
        _ortho: false,
        _orthoSize: 5,
        _yaw: 0, _pitch: 0,
      };

      cam.tdLook     = (tx,ty,tz)   => { cam._target=_v3(tx||0,ty||0,tz||0); return cam; };
      cam.tdPlace    = (x,y,z)      => { cam._pos=_v3(x||0,y||0,z||0); return cam; };
      cam.tdFov      = f            => { cam._fov=f||60; return cam; };
      cam.tdNear     = n            => { cam._near=n||0.1; return cam; };
      cam.tdFar      = f            => { cam._far=f||1000; return cam; };
      cam.tdOrtho    = s            => { cam._ortho=true; cam._orthoSize=s||5; return cam; };
      cam.tdPersp    = ()           => { cam._ortho=false; return cam; };
      cam.tdAim      = (dx,dy)      => {
        cam._yaw   += dx;
        cam._pitch  = Math.max(-89,Math.min(89,cam._pitch+dy));
        const p=cam._pitch*_DEG, y=cam._yaw*_DEG;
        const d=_v3(Math.cos(p)*Math.sin(y), Math.sin(p), Math.cos(p)*Math.cos(y));
        cam._target = _v3add(cam._pos, d);
        return cam;
      };
      cam.tdOrbit    = (dx,dy,dist) => {
        cam._yaw   += dx;
        cam._pitch  = Math.max(-89,Math.min(89,cam._pitch+dy));
        const p=cam._pitch*_DEG, y=cam._yaw*_DEG, r=dist||_v3len(_v3sub(cam._pos,cam._target));
        const d=_v3(Math.cos(p)*Math.sin(y), Math.sin(p), Math.cos(p)*Math.cos(y));
        cam._pos = _v3add(cam._target, _v3scl(d,r));
        return cam;
      };
      cam.tdPan      = (dx,dy)      => {
        const fwd=_v3norm(_v3sub(cam._target,cam._pos));
        const right=_v3norm(_v3cross(fwd,cam._up));
        const up=_v3cross(right,fwd);
        cam._pos    = _v3sub(_v3sub(cam._pos, _v3scl(right,dx)), _v3scl(up,dy));
        cam._target = _v3sub(_v3sub(cam._target, _v3scl(right,dx)), _v3scl(up,dy));
        return cam;
      };
      cam.tdTilt     = deg          => {
        const fwd=_v3norm(_v3sub(cam._target,cam._pos)), r=_v3len(_v3sub(cam._target,cam._pos));
        const m=_m4rotX(deg||0);
        const d=_applyM4(m,fwd);
        cam._target=_v3add(cam._pos,_v3scl(d,r));
        return cam;
      };
      cam.tdRoll     = deg          => {
        const m=_m4rotZ(deg||0);
        cam._up=_v3norm(_applyM4(m,cam._up));
        return cam;
      };

      cam._buildProjView = (aspect) => {
        const f=_v3norm(_v3sub(cam._target,cam._pos));
        const r=_v3norm(_v3cross(f,cam._up));
        const u=_v3cross(r,f);
        const view = [
          r.x, u.x,-f.x,0,
          r.y, u.y,-f.y,0,
          r.z, u.z,-f.z,0,
          -_v3dot(r,cam._pos),-_v3dot(u,cam._pos),_v3dot(f,cam._pos),1
        ];
        const near=cam._near, far=cam._far;
        let proj;
        if(cam._ortho){
          const s=cam._orthoSize, inv=1/(far-near);
          proj=[1/s,0,0,0, 0,aspect/s,0,0, 0,0,-2*inv,0, 0,0,-(far+near)*inv,1];
        } else {
          const fovR=cam._fov*_DEG, tanHalf=Math.tan(fovR/2);
          proj=[1/(aspect*tanHalf),0,0,0, 0,1/tanHalf,0,0,
                0,0,-(far+near)/(far-near),-1, 0,0,-2*far*near/(far-near),0];
        }
        return _m4mul(view,proj);
      };

      return cam;
    }

    /* ════════════════════════════════════════════════════════════════════════
       SCENE  (unchanged)
       ════════════════════════════════════════════════════════════════════════ */

    function _makeScene3D() {
      const sc = {
        __tdType__: 'scene3d',
        _meshes: [],
        _lights: [],
        _bg: '#0a0a0f',
        _fogMode: null,
        _fogColor: '#000000',
        _fogNear: 10,
        _fogFar: 50,
        _fogDensity: 0.05,
      };

      sc.tdAddMesh    = m  => { sc._meshes.push(m); return sc; };
      sc.tdRemoveMesh = m  => { sc._meshes=sc._meshes.filter(x=>x!==m); return sc; };
      sc.tdGetMesh    = tag=> sc._meshes.find(m=>m._tag===String(tag))||null;
      sc.tdFindByTag  = tag=> sc._meshes.filter(m=>m._tag===String(tag));
      sc.tdClearScene = ()  => { sc._meshes=[]; sc._lights=[]; return sc; };
      sc.tdAddLight   = l  => { sc._lights.push(l); return sc; };
      sc.tdRemoveLight= l  => { sc._lights=sc._lights.filter(x=>x!==l); return sc; };
      sc.tdBackground3D=(c)=> { sc._bg=c; return sc; };
      sc.tdFog        = (mode,color,a,b)=>{ sc._fogMode=mode; sc._fogColor=color||'#000'; sc._fogNear=a||10; sc._fogFar=b||50; sc._fogDensity=a||0.05; return sc; };

      return sc;
    }

    /* ════════════════════════════════════════════════════════════════════════
       LIGHTS  (unchanged)
       ════════════════════════════════════════════════════════════════════════ */

    function _makeLight(type, x, y, z, color, intensity) {
      const L = {
        __tdType__: 'light',
        _kind: type,
        _pos: _v3(x||0,y||5,z||0),
        _dir: _v3norm(_v3(x||0,y||-1,z||0)),
        _color: _parseColor(color||'#ffffff') || {r:1,g:1,b:1},
        _intensity: intensity||1,
        _on: true,
      };
      L.tdPlace = (px,py,pz) => { L._pos=_v3(px||0,py||0,pz||0); return L; };
      L.tdAim   = (dx,dy,dz) => { L._dir=_v3norm(_v3(dx||0,dy||0,dz||0)); return L; };
      L.tdColor = c           => { L._color=_parseColor(c)||{r:1,g:1,b:1}; return L; };
      L.tdBright= v           => { L._intensity=v||1; return L; };
      L.tdOn    = ()          => { L._on=true; return L; };
      L.tdOff   = ()          => { L._on=false; return L; };
      return L;
    }

    /* ════════════════════════════════════════════════════════════════════════
       RENDERER  (unchanged — pure math + ctx calls, works with any 2D ctx)
       ════════════════════════════════════════════════════════════════════════ */

    function _projectVert(v, pvMatrix, w, h) {
      const x=pvMatrix[0]*v.x+pvMatrix[4]*v.y+pvMatrix[8]*v.z +pvMatrix[12];
      const y=pvMatrix[1]*v.x+pvMatrix[5]*v.y+pvMatrix[9]*v.z +pvMatrix[13];
      const z=pvMatrix[2]*v.x+pvMatrix[6]*v.y+pvMatrix[10]*v.z+pvMatrix[14];
      const wc=pvMatrix[3]*v.x+pvMatrix[7]*v.y+pvMatrix[11]*v.z+pvMatrix[15];
      if(Math.abs(wc)<1e-6) return null;
      return { sx:(x/wc+1)*.5*w, sy:(-y/wc+1)*.5*h, depth:z/wc };
    }

    function _fogFactor(depth, sc) {
      if(!sc._fogMode) return 1;
      if(sc._fogMode==='linear') return Math.max(0,Math.min(1,(sc._fogFar-depth)/(sc._fogFar-sc._fogNear)));
      return Math.exp(-sc._fogDensity*sc._fogDensity*depth*depth);
    }

    function _mixColor(hexA, hexB, t) {
      const a=_parseColor(hexA)||{r:0,g:0,b:0};
      const b=_parseColor(hexB)||{r:0,g:0,b:0};
      return _colorToHex(a.r+(b.r-a.r)*t, a.g+(b.g-a.g)*t, a.b+(b.b-a.b)*t);
    }

    function _lightFaceFast(faceNormal, worldVerts, sc, mat, face, baseRGB) {
      let r=0,g=0,b=0;
      const faceCenter = _v3scl(_v3add(_v3add(worldVerts[face[0]],worldVerts[face[1]]),worldVerts[face[2]]),1/3);

      sc._lights.forEach(light=>{
        if(!light._on) return;
        let diff=0;
        if(light._kind==='ambient'){
          diff=light._intensity;
        } else if(light._kind==='directional'){
          diff=Math.max(0,-_v3dot(faceNormal,_v3norm(light._dir)))*light._intensity;
        } else if(light._kind==='point'){
          const toL=_v3sub(light._pos,faceCenter);
          const dist=_v3len(toL);
          const atten=1/(1+0.1*dist+0.01*dist*dist);
          diff=Math.max(0,_v3dot(faceNormal,_v3norm(toL)))*light._intensity*atten;
        }
        r+=baseRGB.r*light._color.r*diff;
        g+=baseRGB.g*light._color.g*diff;
        b+=baseRGB.b*light._color.b*diff;
      });

      if(sc._lights.length===0){
        r=baseRGB.r*.85; g=baseRGB.g*.85; b=baseRGB.b*.85;
      }
      return _colorToHex(Math.min(1,r),Math.min(1,g),Math.min(1,b));
    }

    function _renderScene(ctx, sc, cam, w, h) {
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle = sc._bg;
      ctx.fillRect(0,0,w,h);

      const aspect = w/h;
      const pv = cam._buildProjView(aspect);
      const allFaces = [];

      sc._meshes.forEach(mesh => {
        if(!mesh._visible) return;
        const allNodes = [mesh];
        mesh._children.forEach(c=>allNodes.push(c));

        allNodes.forEach(node => {
          if (node._dirty) { _rebuildWorldMatrix(node); node._dirty=false; }
          const wVerts = node._verts.map(v => _applyM4(node._world,v));

          node._faces.forEach((face,fi) => {
            const wA=wVerts[face[0]], wB=wVerts[face[1]], wC=wVerts[face[2]];
            if(!wA||!wB||!wC) return;

            const faceNorm = node._normals[fi]
              ? _applyM4(_m4mul(node._world,_m4id()), node._normals[fi])
              : _v3norm(_v3cross(_v3sub(wB,wA),_v3sub(wC,wA)));
            const normFixed = _v3norm(faceNorm);

            const pA=_projectVert(wA,pv,w,h);
            const pB=_projectVert(wB,pv,w,h);
            const pC=_projectVert(wC,pv,w,h);
            if(!pA||!pB||!pC) return;

            if(pA.depth<-1||pA.depth>1||pB.depth<-1||pB.depth>1||pC.depth<-1||pC.depth>1) return;

            const cross=(pB.sx-pA.sx)*(pC.sy-pA.sy)-(pB.sy-pA.sy)*(pC.sx-pA.sx);
            if(cross>0) return;

            const avgDepth=(pA.depth+pB.depth+pC.depth)/3;
            if (!node._cachedColor) node._cachedColor = _parseColor((node._material&&node._material.color)||'#cccccc')||{r:.8,g:.8,b:.8};
            const faceColor=_lightFaceFast(normFixed,wVerts,sc,node._material,face,node._cachedColor);
            const fogT=1-_fogFactor(avgDepth,sc);
            const finalColor=fogT>0?_mixColor(faceColor,sc._fogColor,fogT):faceColor;

            allFaces.push({pA,pB,pC,depth:avgDepth,color:finalColor,
              wire:node._material&&node._material.wire,
              edgeColor:node._material&&node._material.edgeColor,
              opacity:node._material?node._material.opacity:1});
          });
        });
      });

      allFaces.sort((a,b)=>b.depth-a.depth);

      allFaces.forEach(tf=>{
        ctx.globalAlpha = tf.opacity!==undefined?tf.opacity:1;
        ctx.beginPath();
        ctx.moveTo(tf.pA.sx,tf.pA.sy);
        ctx.lineTo(tf.pB.sx,tf.pB.sy);
        ctx.lineTo(tf.pC.sx,tf.pC.sy);
        ctx.closePath();
        if(tf.wire){
          ctx.strokeStyle=tf.edgeColor||tf.color;
          ctx.lineWidth=1;
          ctx.stroke();
        } else {
          ctx.fillStyle=tf.color;
          ctx.fill();
          if(tf.edgeColor){
            ctx.strokeStyle=tf.edgeColor;
            ctx.lineWidth=0.5;
            ctx.stroke();
          }
        }
      });
      ctx.globalAlpha=1;
    }

    /* ════════════════════════════════════════════════════════════════════════
       MATERIAL  (unchanged)
       ════════════════════════════════════════════════════════════════════════ */

    function _makeMaterial(colorHex, opts) {
      opts = opts||{};
      return {
        __tdType__: 'material',
        color: colorHex||'#cccccc',
        wire: opts.wire||false,
        smooth: opts.smooth!==false,
        opacity: opts.opacity!==undefined?opts.opacity:1,
        edgeColor: opts.edgeColor||null,
        uvScale: opts.uvScale||1,
      };
    }

    /* ════════════════════════════════════════════════════════════════════════
       RAYCASTING  (unchanged)
       ════════════════════════════════════════════════════════════════════════ */

    function _rayFromScreen(sx, sy, cvs, cam) {
      const w=cvs.width||400, h=cvs.height||300;
      const aspect=w/h;
      const ndcX=(sx/w)*2-1, ndcY=1-(sy/h)*2;
      const fovR=cam._fov*_DEG, tanH=Math.tan(fovR/2);
      const fwd=_v3norm(_v3sub(cam._target,cam._pos));
      const right=_v3norm(_v3cross(fwd,cam._up));
      const up=_v3cross(right,fwd);
      const dir=_v3norm(_v3add(_v3add(fwd,_v3scl(right,ndcX*aspect*tanH)),_v3scl(up,ndcY*tanH)));
      return {origin:cam._pos, dir};
    }

    function _rayTriIntersect(ray, a, b, c) {
      const e1=_v3sub(b,a), e2=_v3sub(c,a);
      const h=_v3cross(ray.dir,e2);
      const det=_v3dot(e1,h);
      if(Math.abs(det)<1e-8) return null;
      const invDet=1/det;
      const s=_v3sub(ray.origin,a);
      const u=_v3dot(s,h)*invDet;
      if(u<0||u>1) return null;
      const q=_v3cross(s,e1);
      const vv=_v3dot(ray.dir,q)*invDet;
      if(vv<0||u+vv>1) return null;
      const t=_v3dot(e2,q)*invDet;
      return t>0.001?t:null;
    }

    function _raycastMesh(ray, mesh) {
      const wVerts=mesh._verts.map(v=>_applyM4(mesh._world,v));
      let minT=Infinity, hitFace=-1;
      mesh._faces.forEach((face,fi)=>{
        const a=wVerts[face[0]],b=wVerts[face[1]],c=wVerts[face[2]];
        if(!a||!b||!c) return;
        const t=_rayTriIntersect(ray,a,b,c);
        if(t!==null&&t<minT){ minT=t; hitFace=fi; }
      });
      if(hitFace<0) return null;
      return {mesh,faceIndex:hitFace,distance:minT,point:_v3add(ray.origin,_v3scl(ray.dir,minT))};
    }

    /* ════════════════════════════════════════════════════════════════════════
       OBJ LOADER  (unchanged)
       ════════════════════════════════════════════════════════════════════════ */

    function _loadOBJ(text) {
      const lines=text.split('\n');
      const rawVerts=[], verts=[], faces=[];
      lines.forEach(line=>{
        line=line.trim();
        if(line.startsWith('v ')){
          const p=line.split(/\s+/);
          rawVerts.push(_v3(parseFloat(p[1]),parseFloat(p[2]),parseFloat(p[3])));
        } else if(line.startsWith('f ')){
          const p=line.split(/\s+/).slice(1).map(s=>parseInt(s.split('/')[0])-1);
          if(p.length>=3){
            const base=verts.length;
            p.forEach(i=>verts.push(rawVerts[i]));
            for(let i=1;i<p.length-1;i++) faces.push([base,base+i,base+i+1]);
          }
        }
      });
      const node=_makeMeshNode();
      node._verts=verts;
      node._faces=faces;
      _computeFaceNormals(node);
      node._material={color:'#cccccc',wire:false,smooth:true,opacity:1,uvScale:1};
      _buildMeshAPI(node);
      return node;
    }

    /* ════════════════════════════════════════════════════════════════════════
       FORGE3D  —  updated for CLI (setInterval instead of requestAnimationFrame)
       ════════════════════════════════════════════════════════════════════════ */

    function _makeForge(cvs) {
      // Works with both browser canvas views and CLI canvas views:
      //   cvs.getCtx()  → returns the 2D rendering context
      //   cvs._flush()  → (CLI only) pushes pixels to the Qt window
      const ctx = cvs.getCtx ? cvs.getCtx() : cvs.__ctx__;
      const w   = cvs.width  || 400;
      const h   = cvs.height || 300;

      const forge = {
        __tdType__: 'forge',
        _scene: null,
        _camera: null,
        _running: false,
        _rafId: null,
        _tickFn: null,
        _lastTs: 0,
        _cvs: cvs,            // keep ref for flushing in CLI mode
      };

      function _doRender() {
        if (forge._scene && forge._camera) {
          _renderScene(ctx, forge._scene, forge._camera, w, h);
        }
        // In CLI mode, push the rendered frame to the Qt display label
        if (!_isBrowser && typeof cvs._flush === 'function') {
          cvs._flush();
        }
      }

      forge.tdRender = (sc, cam) => {
        forge._scene = sc; forge._camera = cam;
        _doRender();
        return forge;
      };

      forge.tdTick = fn => {
        forge._tickFn = fn;
        return forge;
      };

      if (_isBrowser) {
        /* ── Browser: use requestAnimationFrame ── */
        forge._loop = ts => {
          if (!forge._running) return;
          const dt = (ts - forge._lastTs) / 1000;
          forge._lastTs = ts;
          if (forge._tickFn) forge._tickFn(dt);
          _doRender();
          forge._rafId = requestAnimationFrame(forge._loop);
        };

        forge.tdStart = () => {
          if (forge._running) return forge;
          forge._running = true;
          forge._rafId = requestAnimationFrame(ts => {
            forge._lastTs = ts;
            forge._rafId = requestAnimationFrame(forge._loop);
          });
          return forge;
        };

        forge.tdStop = () => {
          forge._running = false;
          if (forge._rafId) { cancelAnimationFrame(forge._rafId); forge._rafId = null; }
          return forge;
        };

      } else {
        /* ── Node.js CLI: use setInterval at ~60 fps ── */
        forge.tdStart = () => {
          if (forge._running) return forge;
          forge._running = true;
          forge._lastTs  = Date.now();
          forge._rafId   = setInterval(() => {
            if (!forge._running) return;
            const now = Date.now();
            const dt  = (now - forge._lastTs) / 1000;
            forge._lastTs = now;
            if (forge._tickFn) forge._tickFn(dt);
            _doRender();
          }, 16); // ~60 fps
          return forge;
        };

        forge.tdStop = () => {
          forge._running = false;
          if (forge._rafId) { clearInterval(forge._rafId); forge._rafId = null; }
          return forge;
        };
      }

      return forge;
    }

    /* ════════════════════════════════════════════════════════════════════════
       PUBLIC API BINDINGS  (unchanged)
       ════════════════════════════════════════════════════════════════════════ */

    G.Forge3D = cvs => _makeForge(cvs);

    G.tdMesh = (verts, faces) => {
      const node = _makeMeshNode();
      node._verts = (verts||[]).map(v=>_v3(v[0]||0,v[1]||0,v[2]||0));
      node._faces = faces||[];
      _computeFaceNormals(node);
      node._material={color:'#cccccc',wire:false,smooth:true,opacity:1,uvScale:1};
      _buildMeshAPI(node);
      return node;
    };

    G.tdCube       = (w,h,d)            => _buildMeshFromGeom(_genCubeGeom(w,h,d));
    G.tdSphere     = (r,segs,rings)      => _buildMeshFromGeom(_genSphereGeom(r,segs,rings));
    G.tdPlane      = (w,h,sw,sh)         => _buildMeshFromGeom(_genPlaneGeom(w,h,sw,sh));
    G.tdCylinder   = (rT,rB,h,segs)      => _buildMeshFromGeom(_genCylinderGeom(rT,rB,h,segs));
    G.tdCone       = (r,h,segs)          => _buildMeshFromGeom(_genConeGeom(r,h,segs));
    G.tdTorus      = (R,r,segs,tube)     => _buildMeshFromGeom(_genTorusGeom(R,r,segs,tube));

    G.tdScene3D    = ()                  => _makeScene3D();
    G.tdCamera     = ()                  => _makeCamera();

    G.tdPointLight = (x,y,z,color,intensity) => _makeLight('point',x,y,z,color,intensity);
    G.tdDirLight   = (x,y,z,color,intensity) => _makeLight('directional',x,y,z,color,intensity);
    G.tdAmbientLight=(color,intensity)        => _makeLight('ambient',0,0,0,color,intensity);

    G.tdMaterial   = (color,opts)        => _makeMaterial(color,opts);

    G.tdVec3       = (x,y,z)            => _v3(x,y,z);
    G.tdVec3Add    = (a,b)              => _v3add(a,b);
    G.tdVec3Sub    = (a,b)              => _v3sub(a,b);
    G.tdVec3Scale  = (a,s)              => _v3scl(a,s);
    G.tdVec3Dot    = (a,b)              => _v3dot(a,b);
    G.tdVec3Cross  = (a,b)              => _v3cross(a,b);
    G.tdVec3Norm   = a                  => _v3norm(a);
    G.tdVec3Len    = a                  => _v3len(a);
    G.tdVec3Lerp   = (a,b,t)           => _v3lerp(a,b,t);
    G.tdVec3Reflect= (v,n)             => _v3refl(v,n);

    G.tdMat4Identity   = ()             => _m4id();
    G.tdMat4Mul        = (a,b)          => _m4mul(a,b);
    G.tdMat4TranslateM = (tx,ty,tz)     => _m4trans(tx,ty,tz);
    G.tdMat4RotX       = deg            => _m4rotX(deg);
    G.tdMat4RotY       = deg            => _m4rotY(deg);
    G.tdMat4RotZ       = deg            => _m4rotZ(deg);
    G.tdMat4ScaleM     = (sx,sy,sz)     => _m4scale(sx,sy,sz);

    G.tdRaycast = (screenX, screenY, cvs, cam, scene) => {
      const ray = _rayFromScreen(screenX, screenY, cvs, cam);
      let closest = null;
      scene._meshes.forEach(mesh=>{
        if(!mesh._visible) return;
        const hit = _raycastMesh(ray, mesh);
        if(hit && (!closest || hit.distance < closest.distance)) closest=hit;
      });
      return closest;
    };

    G.tdPickObject = (screenX, screenY, cvs, cam, scene) => {
      const hit = G.tdRaycast(screenX, screenY, cvs, cam, scene);
      return hit ? hit.mesh : null;
    };

    G.tdFogLinear = (near, far, color) => ({mode:'linear', near, far, color:color||'#000000'});
    G.tdFogExp    = (density, color)   => ({mode:'exp', density, color:color||'#000000'});

    G.tdLoadOBJ   = text => _loadOBJ(text);

    G.tdSnapshot  = cvs => {
      // Works for both browser canvas element and CLI node-canvas
      if (cvs && cvs.__canvas__ && cvs.__canvas__.toDataURL) return cvs.__canvas__.toDataURL('image/png');
      const el = cvs.__el__ || cvs;
      if (el && el.toDataURL) return el.toDataURL('image/png');
      return '';
    };

    G.tdMerge = (meshA, meshB) => {
      const node = _makeMeshNode();
      const offsetB = meshA._verts.length;
      node._verts   = meshA._verts.concat(meshB._verts);
      node._faces   = meshA._faces.concat(meshB._faces.map(f=>f.map(i=>i+offsetB)));
      _computeFaceNormals(node);
      node._material = Object.assign({},meshA._material);
      _buildMeshAPI(node);
      return node;
    };

  }
};

})();
