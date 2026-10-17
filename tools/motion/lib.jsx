// Small helpers over EffectCraft's After Effects-style object model.
function rgb(hex, a) {
  var n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a === undefined ? 1 : a];
}
function shapeLayer(comp, name) {
  var layer = comp.layers.addShape();
  layer.name = name;
  return layer;
}
function addGroup(layer) {
  return layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
}
function addEllipse(group, w, h) {
  var e = group.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse");
  e.property("ADBE Vector Ellipse Size").setValue([w, h]);
  return e;
}
function addFill(group, hex, opacity) {
  var f = group.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
  f.property("ADBE Vector Fill Color").setValue(rgb(hex));
  if (opacity !== undefined) f.property("ADBE Vector Fill Opacity").setValue(opacity);
  return f;
}
function addStroke(group, hex, width, opacity) {
  var s = group.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");
  s.property("ADBE Vector Stroke Color").setValue(rgb(hex));
  s.property("ADBE Vector Stroke Width").setValue(width);
  if (opacity !== undefined) s.property("ADBE Vector Stroke Opacity").setValue(opacity);
  return s;
}
function xform(layer) {
  return layer.property("ADBE Transform Group");
}
