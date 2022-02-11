function make_array(arr) {
  return Array.isArray(arr) ? arr : [arr];
}

function join(arr, spliter = '\n') {
  return (arr || []).join(spliter);
}

function last(arr, n = 1) {
  return arr[arr.length - n];
}

function first(arr) {
  return arr[0];
}

function clone(arr) {
  return JSON.parse(JSON.stringify(arr));
}

function duplicate(arr) {
  return [].concat(arr, arr);
}

function flat_map(arr, fn) {
  if (Array.prototype.flatMap) return arr.flatMap(fn);
  return arr.reduce((acc, x) => acc.concat(fn(x)), []);
}

function remove_empty_values(arr) {
  return arr.filter(v => (
    v !== undefined &&
    v !== null &&
    String(v).trim().length
  ));
}

export {
  make_array,
  join,
  last,
  first,
  clone,
  duplicate,
  flat_map,
  remove_empty_values,
}
