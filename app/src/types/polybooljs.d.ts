declare module 'polybooljs' {
  export interface PolyBoolPolygon {
    regions: number[][][];
    inverted: boolean;
  }

  const PolyBool: {
    union(a: PolyBoolPolygon, b: PolyBoolPolygon): PolyBoolPolygon;
    intersect(a: PolyBoolPolygon, b: PolyBoolPolygon): PolyBoolPolygon;
    difference(a: PolyBoolPolygon, b: PolyBoolPolygon): PolyBoolPolygon;
    differenceRev(a: PolyBoolPolygon, b: PolyBoolPolygon): PolyBoolPolygon;
    xor(a: PolyBoolPolygon, b: PolyBoolPolygon): PolyBoolPolygon;
  };

  export default PolyBool;
}
