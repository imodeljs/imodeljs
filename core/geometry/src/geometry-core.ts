/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Utility
 */

// REMARK:
// The docs-group-description comments are followed by empty classes with names corresponding to the doc-group.
// Normally (in committed code) these are commented out.
// The comments have distinctive strings so that simple search and replace can make the "real".
// This is useful when working on the documentation:  When the empty classes are present, VSCode will format the doc comments
// for and display them when the mouse hovers over the class name.

/**
 * @docs-package-description
 * The geometry-core package contains classes for working with geometry:  points, vectors, curves, surfaces, and analytic solids
 */
/**
 * @docs-group-description CartesianGeometry
 * Points, Vectors, Planes, and Transformations for x,y,z geometry.
 * * Fundamental cartesian geometry objects:
 *   * Point2d, Point3d -- points with x,y,z coordinates
 *   * Vector2d, Vector3d -- vectors with x,y,z coordinates
 *   * Matrix3d -- 3x3 matrix
 *   * * commonly used for pure rotations
 *   * * scale and skew entries are also allowed.
 *   * Transform -- an origin and axes.
 *   * Range1d, Range2d, Range3d -- subsets of 1d, 2d, and 3d space bounded by low and high values.
 *   * Ray3d -- a ray defined by origin and direction vector
 *   * Plane3dByOriginAndUnitNormal -- a plane defined by an origin and a single vector which is perpendicular to the plane
 *   * plane3dByOriginAndVectors -- a plane defined by an origin and two vectors in the plane.
 * * Angles
 *   * Angle -- a strongly typed angle object whose method names make it clear whether input and outputs are degrees or radians.
 *   * AngleSweep -- an angular interval
 *   * LatitudeLongitudeNumber -- carrier for position and altitude on sphere or ellipsoid
 *   * YawPitchAndRollAngles -- 3 angles that define a rotated coordinate system.
 * * Utility classes
 *   * FrameBuilder -- construction of coordinate frames from mixed data sources.
 *   * ClipPlane -- a single plane
 *   * ConvexClipPlaneSet -- an array of planes bounding a convex volume
 *   * ClipPlaneSet -- an array of ConvexClipPlaneSet, defining the union of their volumes
 *   * BilinearPatch -- twisted quadrilateral defined by 4 points
 *   * BarycentricTriangle -- triangle defined by 3 points.
 *   * Constant -- various numeric values exported as readonly constants
 */
// doc:export class CartesianGeometryDoc { }
/**
 * @docs-group-description ArraysAndInterfaces
 * These classes support array operations and inheritance-based algorithms.
 * * Arrays
 *   * GrowableArray -- A carrier for a Float64Array, with methods that hide reallocation of the underlying array as contents are added.
 *   * Point2dArray, Point3dArray, Point4dArray, Vector3dArray -- miscellaneous operations on arrays of 2d and 3d points.
 * * Interfaces
 *   * GeometryHandler -- a double-dispatch protocol used for efficient implementation of algorithms that work on many geometry types.
 *
 */
// doc:export class ArraysAndInterfacesDoc { }

/**
 * @docs-group-description Bspline
 * A bspline curve or surface is used for curved freeform geometry defined by controls points (sometimes called poles).
 * * BSplineCurve --  a curve defined by control points (which are not on the curve)
 * * InterpolationCurve -- a curve defined by passthrough points, with "good" visual properties
 * * BSplineSurfaceXYZ -- a surface with XYZ
 * * BsplineSurfaceXYZW -- a surface with weighted (rational) XYZ coordinates
 * * KnotVector -- vector of breakpoints in bspline definitions.
 */
// doc:export class BsplineDoc { }

/**
 * @docs-group-description Curve
 * Curves in the GeometryQuery hierarchy: LineSegment3d, LineString3d, Arc3d, TransitionSpiral3d
 * * CurvePrimitive -- base class for parametric curves
 *   * LineSegment3d -- a (bounded) portion of an unbounded line
 *   * Arc3d -- a circular or elliptic arc
 *   * LineString3d -- a sequence of points joined by line segments
 *   * TransitionSpiral -- controlled transition between curvatures
 * * Support classes
 * * PointString3d -- a sequence of isolated points
 * * StrokeOptions -- tolerances to describe stroking accuracy
 * * RecursiveCurveProcessor, RecursiveCurveProcessorWithStack -- algorithmic support for trees with CurvePrimitives at the leaf level.
 */
// doc:export class CurveDoc { }
/**
 * @docs-group-description Numerics
 * The Numerics classes have geometric and numeric methods used during large algorithms in other classes.
 */
// doc:export class NumericsDoc { }
/**
 * @docs-group-description Polyface
 * A Polyface is a mesh structure with arrays of points that are shared among multiple incident facets.
 */
// doc:export class PolyfaceDoc { }
/**
 * @docs-group-description Serialization
 * These classes are related to serialization of geometry classes.
 * * IModelJson.Reader, IModelJson.Writer -- Conversion of in-memory geometry objects to json objects for persistence and transmission.
 */
// doc:export class SerializationDoc { }
/**
 * @docs-group-description Solid
 * Analytic Solids in the GeometryQuery hierarchy: Box, Sphere, Cone, TorusPipe, LinearSweep, RotationalSweep, RuledSweep
 * * Box -- a box solid.  This is usually rectangular on all faces, but can in one directly like a view frustum
 * * Sphere -- a sphere
 * * Cone -- a cone or cylinder
 * * TorusPipe -- a pipe elbow
 * * LinearSweep -- a linear sweep of a base contour
 * * RotationalSweep -- a rotational sweep of a base contour
 * * RuledSweep -- two or more similarly structured contours joined by linear rule lines.
 */
// doc:export class SolidDOc { }
/**
 * @docs-group-description Topology
 * The Topology classes provide adjacency structures used in triangulations.
 */
// doc:export class TopologyDoc { }
/**
 * @docs-group-description RangeSearch
 * Support classes for searching collections of ranges.
 */
export * from "./geometry3d/Angle";
export * from "./geometry3d/AngleSweep";
export * from "./geometry3d/LongitudeLatitudeAltitude";
export * from "./geometry3d/BarycentricTriangle";
export * from "./geometry3d/BilinearPatch";
export * from "./geometry3d/Ellipsoid";
export * from "./geometry3d/FrameBuilder";
export * from "./geometry3d/FrustumAnimation";
export * from "./geometry3d/GeometryHandler";
export * from "./geometry3d/GrowableBlockedArray";
export * from "./geometry3d/GrowableFloat64Array";
export * from "./geometry3d/GrowableXYArray";
export * from "./geometry3d/GrowableXYZArray";
export * from "./geometry3d/IndexedCollectionInterval";
export * from "./geometry3d/IndexedXYCollection";
export * from "./geometry3d/IndexedXYZCollection";
export * from "./geometry3d/Matrix3d";
export * from "./geometry3d/OrderedRotationAngles";
export * from "./geometry3d/Plane3dByOriginAndUnitNormal";
export * from "./geometry3d/Plane3dByOriginAndVectors";
export * from "./geometry3d/Point2dArrayCarrier";
export * from "./geometry3d/Point2dVector2d";
export * from "./geometry3d/Point3dVector3d";
export * from "./geometry3d/PointHelpers";
export * from "./geometry3d/Point3dArrayCarrier";
export * from "./geometry3d/PolylineOps";
export * from "./geometry3d/PolygonOps";
export * from "./geometry3d/Range";
export * from "./geometry3d/Ray3d";
export * from "./geometry3d/Segment1d";
export * from "./geometry3d/Transform";
export * from "./geometry3d/UVSurfaceOps";
export * from "./geometry3d/XYZProps";
export * from "./geometry3d/YawPitchRollAngles";

export * from "./Geometry";
export * from "./Constant";
export * from "./clipping/BooleanClipFactory";
export * from "./clipping/ClipPlane";
export * from "./clipping/ConvexClipPlaneSet";
export * from "./clipping/UnionOfConvexClipPlaneSets";
export * from "./clipping/ClipPrimitive";
export * from "./clipping/ClipVector";
export * from "./clipping/ClipUtils";
export * from "./numerics/ConvexPolygon2d";
export * from "./geometry4d/PlaneByOriginAndVectors4d";
export * from "./geometry4d/Point4d";
export * from "./geometry4d/Matrix4d";
export * from "./geometry4d/Map4d";
export * from "./geometry4d/MomentData";
export * from "./numerics/BezierPolynomials";
export * from "./numerics/ClusterableArray";
export * from "./numerics/Newton";
export * from "./numerics/Complex";
export * from "./numerics/ConvexPolygon2d";
export * from "./numerics/Newton";
export * from "./numerics/PascalCoefficients";
export * from "./numerics/Polynomials";
export * from "./numerics/Quadrature";
export * from "./numerics/Range1dArray";
export * from "./numerics/TriDiagonalSystem";

export * from "./curve/Arc3d";
export * from "./curve/ConstructCurveBetweenCurves";
export * from "./curve/CoordinateXYZ";
export * from "./curve/CurveChain";
export * from "./curve/CurveChainWithDistanceIndex";
export * from "./curve/CurveExtendMode";
export * from "./curve/CurveCollection";
export * from "./curve/CurveCurve";
export * from "./curve/CurveCurveIntersectXY";
export * from "./curve/CurveCurveIntersectXYZ";
export * from "./curve/CurveLocationDetail";
export * from "./curve/CurveFactory";
export * from "./curve/CurvePrimitive";
export * from "./curve/CurveProcessor";
export * from "./curve/GeometryQuery";
export * from "./curve/LineSegment3d";
export * from "./curve/LineString3d";
export * from "./curve/Loop";
export * from "./curve/ParityRegion";
export * from "./curve/Path";
export * from "./curve/RegionMomentsXY";
export * from "./curve/RegionOps";
export * from "./curve/internalContexts/PolygonOffsetContext";
export * from "./curve/PointString3d";
export * from "./curve/ProxyCurve";
export * from "./curve/StrokeOptions";
export * from "./curve/spiral/TransitionSpiral3d";
export * from "./curve/spiral/IntegratedSpiral3d";
export * from "./curve/spiral/DirectSpiral3d";
export * from "./curve/UnionRegion";
export * from "./curve/Query/StrokeCountMap";
export * from "./solid/Box";
export * from "./solid/Cone";
export * from "./solid/LinearSweep";
export * from "./solid/RotationalSweep";
export * from "./solid/RuledSweep";
export * from "./solid/SolidPrimitive";
export * from "./solid/Sphere";
export * from "./solid/SweepContour";
export * from "./solid/TorusPipe";
export * from "./bspline/AkimaCurve3d";
export * from "./bspline/Bezier1dNd";
export * from "./bspline/BezierCurveBase";
export * from "./bspline/BezierCurve3d";
export * from "./bspline/BezierCurve3dH";
export * from "./bspline/BSplineCurve";
export * from "./bspline/BSpline1dNd";
export * from "./bspline/BSplineCurve3dH";
export * from "./bspline/BSplineSurface";
export * from "./bspline/InterpolationCurve3d";
export * from "./bspline/KnotVector";
export * from "./polyface/AuxData";
export * from "./polyface/BoxTopology";
export * from "./polyface/FacetFaceData";
export * from "./polyface/Polyface";
export * from "./polyface/IndexedPolyfaceVisitor";
export * from "./polyface/PolyfaceBuilder";
export * from "./polyface/PolyfaceData";
export * from "./polyface/PolyfaceQuery";
export * from "./polyface/PolyfaceClip";
export * from "./polyface/TaggedNumericData";
export * from "./topology/Graph";
export * from "./topology/Triangulation";
export * from "./serialization/IModelJsonSchema";
export * from "./serialization/DeepCompare";
export * from "./serialization/GeometrySamples";
export { BentleyGeometryFlatBuffer } from "./serialization/BentleyGeometryFlatBuffer";
