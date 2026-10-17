// Loader: an asteroid (amber) with a short trail orbits Earth (blue) on a tilted ring.
var W = 200, H = 200, DUR = 2.4, FPS = 60;
var CX = W / 2, CY = H / 2, RX = 74, RY = 26, TILT = -18 * Math.PI / 180;
var comp = app.project.items.addComp("loader", W, H, 1, DUR, FPS);

function orbitPoint(t) { // t in 0..1 around the ring, counter-clockwise on screen
  var a = -t * 2 * Math.PI;
  var x = RX * Math.cos(a), y = RY * Math.sin(a);
  return [CX + x * Math.cos(TILT) - y * Math.sin(TILT), CY + x * Math.sin(TILT) + y * Math.cos(TILT)];
}

// Ring
var ring = shapeLayer(comp, "ring");
var rg = addGroup(ring);
addEllipse(rg, 2 * RX, 2 * RY);
addStroke(rg, "#c9d2e6", 1.5, 35);
rg.property("ADBE Vector Transform Group").property("ADBE Vector Rotation").setValue(-18);

// Earth
var earth = shapeLayer(comp, "earth");
var eg = addGroup(earth);
addEllipse(eg, 26, 26);
addFill(eg, "#4ea1ff");

// Trail dots then the asteroid on top. Each follows the ring, a little behind the last.
var trail = [[0.075, 4, 25], [0.05, 5, 45], [0.025, 6, 70], [0, 9, 100]];
var STEPS = 48;
for (var k = 0; k < trail.length; k++) {
  var lag = trail[k][0], size = trail[k][1], opacity = trail[k][2];
  var dot = shapeLayer(comp, k === trail.length - 1 ? "asteroid" : "trail " + (k + 1));
  var dg = addGroup(dot);
  addEllipse(dg, size, size);
  addFill(dg, "#ffb02e", opacity);
  var pos = xform(dot).property("ADBE Position");
  for (var i = 0; i <= STEPS; i++) {
    var t = i / STEPS;
    pos.setValueAtTime(t * DUR, orbitPoint(t - lag));
  }
}
// The asteroid passes in front of Earth on the near side of the ring, so it is the top layer.
writeLn("loader: " + comp.numLayers + " layers");
