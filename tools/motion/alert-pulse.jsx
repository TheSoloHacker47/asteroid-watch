// Alert pulse: a red dot with two rings that expand and fade, offset by half a cycle.
var S = 64, DUR = 1.6, FPS = 60;
var comp = app.project.items.addComp("alert-pulse", S, S, 1, DUR, FPS);

function ringLayer(name, start) {
  var layer = shapeLayer(comp, name);
  var g = addGroup(layer);
  addEllipse(g, 12, 12);
  addStroke(g, "#ff5a4f", 1.5);
  var sc = xform(layer).property("ADBE Scale");
  var op = xform(layer).property("ADBE Opacity");
  // one expansion per cycle; the second ring wraps around the loop point
  var a = start, b = start + DUR;
  sc.setValueAtTime(a, [100, 100]); sc.setValueAtTime(b, [430, 430]);
  op.setValueAtTime(a, 85); op.setValueAtTime(b, 0);
  if (start < 0) { // keep the wrapped half visible at the start of the loop
    sc.setValueAtTime(0, [100 + 330 * (-start / DUR), 100 + 330 * (-start / DUR)]);
  }
}
ringLayer("ring b", -DUR / 2);
ringLayer("ring a", 0);
var core = shapeLayer(comp, "core");
var cg = addGroup(core);
addEllipse(cg, 12, 12);
addFill(cg, "#ff5a4f");
writeLn("alert-pulse: " + comp.numLayers + " layers");
