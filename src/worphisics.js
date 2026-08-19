/* ══════════════════════════════════════════════════════════════════════════════
   worphisics.zl  —  ZETA++ (ZPP) 2D PHYSICS ENGINE
   Pure math — no DOM required, works headless or paired with worgame.zl for
   rendering. Every public function/attribute is prefixed wp_.

   SCOPE — kept deliberately small and correct rather than large and buggy:
   box/circle bodies, gravity, force/impulse integration, AABB + circle
   collision detection with simple positional resolution, static bodies,
   restitution/friction, and enter/exit collision callbacks. No joints or
   springs — those are easy to get subtly wrong, so they're left out rather
   than shipped half-working.
   ══════════════════════════════════════════════════════════════════════════════ */

(function WorPhisics() {
'use strict';

let _bodyIdCounter = 1;

/* ══════════════════════════════════════════════════════════════════════════
   WORLD
   ══════════════════════════════════════════════════════════════════════════ */
function wp_CreateWorld(gravityX, gravityY) {
  return {
    wp_kind: 'world',
    wp_gravityX: gravityX == null ? 0 : gravityX,
    wp_gravityY: gravityY == null ? 900 : gravityY,   /* px/s^2, ~Earth-ish at 100px = 1m scale */
    wp_bodies: [],
    __private: {
      activePairs: new Set(),
      onEnter: [],
      onExit: [],
    },
  };
}
function wp_SetGravity(world, gx, gy) {
  if (!world) return;
  world.wp_gravityX = gx; world.wp_gravityY = gy;
}
function wp_ClearWorld(world) {
  if (!world) return;
  world.wp_bodies = [];
  world.__private.activePairs.clear();
}

/* ══════════════════════════════════════════════════════════════════════════
   BODIES
   ══════════════════════════════════════════════════════════════════════════ */
function wp_CreateBody(x, y, w, h, shape) {
  return {
    wp_kind: 'body',
    __id: _bodyIdCounter++,
    wp_shape: (shape === 'circle') ? 'circle' : 'box',
    wp_x: x || 0, wp_y: y || 0,
    wp_width: w || 20, wp_height: h == null ? (w || 20) : h,
    wp_radius: (w || 20) / 2,
    wp_vx: 0, wp_vy: 0,
    wp_mass: 1,
    wp_restitution: 0.3,   /* 0 = no bounce, 1 = perfectly elastic */
    wp_friction: 0.05,     /* 0..1, velocity damping applied every step */
    wp_isStatic: false,
    __fx: 0, __fy: 0,
  };
}
function wp_AddBody(world, body) {
  if (!world || !body) return;
  world.wp_bodies.push(body);
}
function wp_RemoveBody(world, body) {
  if (!world || !body) return;
  world.wp_bodies = world.wp_bodies.filter(b => b !== body);
}
function wp_SetStatic(body, isStatic) { if (body) body.wp_isStatic = !!isStatic; }
function wp_SetMass(body, mass) { if (body) body.wp_mass = Math.max(0.0001, mass); }
function wp_SetRestitution(body, r) { if (body) body.wp_restitution = Math.max(0, Math.min(1, r)); }
function wp_SetFriction(body, f) { if (body) body.wp_friction = Math.max(0, Math.min(1, f)); }
function wp_ApplyForce(body, fx, fy) {
  if (!body) return;
  body.__fx += fx; body.__fy += fy;
}
function wp_ApplyImpulse(body, ix, iy) {
  if (!body || body.wp_isStatic) return;
  body.wp_vx += ix / body.wp_mass;
  body.wp_vy += iy / body.wp_mass;
}
function wp_SetVelocity(body, vx, vy) {
  if (!body) return;
  body.wp_vx = vx; body.wp_vy = vy;
}
function wp_GetBodyRect(body) {
  if (!body) return { x: 0, y: 0, w: 0, h: 0 };
  if (body.wp_shape === 'circle') {
    const r = body.wp_radius;
    return { x: body.wp_x - r, y: body.wp_y - r, w: r * 2, h: r * 2 };
  }
  return { x: body.wp_x, y: body.wp_y, w: body.wp_width, h: body.wp_height };
}
/* Copies a body's position onto any target object (a worgame sprite, a
   worlib handle via wl_SetPos, or a plain {x,y} you made yourself) so you
   don't have to write that glue code by hand every frame. */
function wp_SyncToSprite(body, target) {
  if (!body || !target) return;
  if ('wg_x' in target) { target.wg_x = body.wp_x; target.wg_y = body.wp_y; }
  else { target.x = body.wp_x; target.y = body.wp_y; }
}

/* ══════════════════════════════════════════════════════════════════════════
   COLLISION DETECTION
   ══════════════════════════════════════════════════════════════════════════ */
function _aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function wp_IsColliding(a, b) {
  if (!a || !b) return false;
  if (a.wp_shape === 'circle' && b.wp_shape === 'circle') {
    const dx = a.wp_x - b.wp_x, dy = a.wp_y - b.wp_y;
    const rr = a.wp_radius + b.wp_radius;
    return (dx * dx + dy * dy) < rr * rr;
  }
  /* box-box, and box-circle approximated via each body's AABB (good enough
     for a simple, reliable engine — a mixed shape narrow-phase test is a
     common source of subtle bugs, so this deliberately stays conservative). */
  return _aabbOverlap(wp_GetBodyRect(a), wp_GetBodyRect(b));
}

function _resolveCollision(a, b) {
  const ra = wp_GetBodyRect(a), rb = wp_GetBodyRect(b);
  const overlapX = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
  const overlapY = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
  if (overlapX <= 0 || overlapY <= 0) return;

  const aStatic = a.wp_isStatic, bStatic = b.wp_isStatic;
  if (aStatic && bStatic) return;

  /* Standard impulse-based resolution: invMass is 0 for static bodies (they
     never move / never receive velocity change); positional correction and
     velocity impulses are both split proportionally to invMass, so a heavy
     body yields less than a light one, and a static body yields nothing. */
  const invMassA = aStatic ? 0 : 1 / a.wp_mass;
  const invMassB = bStatic ? 0 : 1 / b.wp_mass;
  const totalInvMass = invMassA + invMassB;
  if (totalInvMass <= 0) return;

  const restitution = (a.wp_restitution + b.wp_restitution) / 2;
  const aShare = invMassA / totalInvMass;
  const bShare = invMassB / totalInvMass;

  if (overlapX < overlapY) {
    /* n points from A to B along X */
    const n = (rb.x + rb.w / 2 >= ra.x + ra.w / 2) ? 1 : -1;
    if (!aStatic) a.wp_x -= n * overlapX * aShare;
    if (!bStatic) b.wp_x += n * overlapX * bShare;

    const rvx = (b.wp_vx - a.wp_vx) * n;
    if (rvx < 0) { /* only apply impulse if still approaching along this axis */
      const j = -(1 + restitution) * rvx / totalInvMass;
      a.wp_vx -= j * invMassA * n;
      b.wp_vx += j * invMassB * n;
    }
  } else {
    const n = (rb.y + rb.h / 2 >= ra.y + ra.h / 2) ? 1 : -1;
    if (!aStatic) a.wp_y -= n * overlapY * aShare;
    if (!bStatic) b.wp_y += n * overlapY * bShare;

    const rvy = (b.wp_vy - a.wp_vy) * n;
    if (rvy < 0) {
      const j = -(1 + restitution) * rvy / totalInvMass;
      a.wp_vy -= j * invMassA * n;
      b.wp_vy += j * invMassB * n;
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   COLLISION CALLBACKS (edge-triggered)
   ══════════════════════════════════════════════════════════════════════════ */
function wp_OnCollisionEnter(world, fn) {
  if (!world || typeof fn !== 'function') return;
  world.__private.onEnter.push(fn);
}
function wp_OnCollisionExit(world, fn) {
  if (!world || typeof fn !== 'function') return;
  world.__private.onExit.push(fn);
}

/* ══════════════════════════════════════════════════════════════════════════
   STEP — the heart of the simulation. Call this once per frame with your
   frame's delta time in seconds (e.g. wp_Step(world, dt)).
   ══════════════════════════════════════════════════════════════════════════ */
function wp_Step(world, dt) {
  if (!world) return;
  dt = Math.min(dt || 1 / 60, 1 / 20); /* clamp so a big lag spike can't blow up the sim */

  const bodies = world.wp_bodies;

  /* integrate forces + gravity -> velocity -> position */
  for (const b of bodies) {
    if (b.wp_isStatic) continue;
    const ax = (world.wp_gravityX + b.__fx / b.wp_mass);
    const ay = (world.wp_gravityY + b.__fy / b.wp_mass);
    b.wp_vx += ax * dt;
    b.wp_vy += ay * dt;
    b.wp_vx *= (1 - b.wp_friction);
    b.wp_vy *= (1 - b.wp_friction);
    b.wp_x += b.wp_vx * dt;
    b.wp_y += b.wp_vy * dt;
    b.__fx = 0; b.__fy = 0;
  }

  /* naive O(n^2) broad+narrow phase — simple and predictable, well suited
     for the tens-of-bodies scale this engine targets. */
  const currentPairs = new Set();
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      if (wp_IsColliding(a, b)) {
        const key = a.__id < b.__id ? a.__id + '-' + b.__id : b.__id + '-' + a.__id;
        currentPairs.add(key);
        if (!world.__private.activePairs.has(key)) {
          world.__private.onEnter.forEach(fn => { try { fn(a, b); } catch (e) { console.error(e); } });
        }
        _resolveCollision(a, b);
      }
    }
  }
  world.__private.activePairs.forEach(key => {
    if (!currentPairs.has(key)) {
      world.__private.onExit.forEach(fn => { try { fn(key); } catch (e) { console.error(e); } });
    }
  });
  world.__private.activePairs = currentPairs;
}

/* ══════════════════════════════════════════════════════════════════════════
   DSALibraries REGISTRATION
   ══════════════════════════════════════════════════════════════════════════ */
if (typeof DSALibraries !== 'undefined') {
  DSALibraries['worphisics.zl'] = {
    description: 'Small, correct 2D physics engine for ZETA++. Pure math, no DOM required. All names prefixed wp_.',
    inject(G) {
      if (typeof window !== 'undefined' && window.__ZPP__) {
        window.__ZPP__.registerBuiltins([
          'wp_CreateWorld','wp_SetGravity','wp_ClearWorld',
          'wp_CreateBody','wp_AddBody','wp_RemoveBody',
          'wp_SetStatic','wp_SetMass','wp_SetRestitution','wp_SetFriction',
          'wp_ApplyForce','wp_ApplyImpulse','wp_SetVelocity',
          'wp_GetBodyRect','wp_SyncToSprite',
          'wp_IsColliding','wp_OnCollisionEnter','wp_OnCollisionExit',
          'wp_Step',
        ]);
        window.__ZPP__.registerTypes(['wp_world', 'wp_body']);
      }
      G.wp_CreateWorld = wp_CreateWorld;   G.wp_SetGravity = wp_SetGravity;
      G.wp_ClearWorld = wp_ClearWorld;
      G.wp_CreateBody = wp_CreateBody;     G.wp_AddBody = wp_AddBody;
      G.wp_RemoveBody = wp_RemoveBody;
      G.wp_SetStatic = wp_SetStatic;       G.wp_SetMass = wp_SetMass;
      G.wp_SetRestitution = wp_SetRestitution; G.wp_SetFriction = wp_SetFriction;
      G.wp_ApplyForce = wp_ApplyForce;     G.wp_ApplyImpulse = wp_ApplyImpulse;
      G.wp_SetVelocity = wp_SetVelocity;
      G.wp_GetBodyRect = wp_GetBodyRect;   G.wp_SyncToSprite = wp_SyncToSprite;
      G.wp_IsColliding = wp_IsColliding;
      G.wp_OnCollisionEnter = wp_OnCollisionEnter;
      G.wp_OnCollisionExit = wp_OnCollisionExit;
      G.wp_Step = wp_Step;
    }
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    wp_CreateWorld, wp_SetGravity, wp_ClearWorld,
    wp_CreateBody, wp_AddBody, wp_RemoveBody,
    wp_SetStatic, wp_SetMass, wp_SetRestitution, wp_SetFriction,
    wp_ApplyForce, wp_ApplyImpulse, wp_SetVelocity,
    wp_GetBodyRect, wp_SyncToSprite,
    wp_IsColliding, wp_OnCollisionEnter, wp_OnCollisionExit,
    wp_Step,
  };
}

})();
