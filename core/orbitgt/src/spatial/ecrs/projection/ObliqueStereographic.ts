/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module OrbitGT
 */

// package orbitgt.spatial.ecrs.projection;

type int8 = number;
type int16 = number;
type int32 = number;
type float32 = number;
type float64 = number;

import { Coordinate } from "../../geom/Coordinate";
import { CRS } from "../CRS";
import { Ellipsoid } from "../Ellipsoid";
import { Operation } from "../Operation";
import { OperationMethod } from "../OperationMethod";
import { ParameterValueList } from "../ParameterValueList";

/**
 * Class ObliqueStereographic defines an Oblique Stereographic projection.
 *
 * The 'source' CRS is the geodetic CRS.
 * The 'target' CRS is the projected CRS.
 *
 * Based on the following document:
 *
 * Coordinate Conversions and Transformations including Formulas
 * Guidance Note Number 7, part 2
 * Revised August 2006
 * Available at: http://www.epsg.org/
 *
 * Formulas: see 1.4.7.1 'Oblique and Equatorial Stereographic cases'
 *
 * @version 1.0 December 2006
 */
/** @internal */
export class ObliqueStereographic extends OperationMethod {
    /** The code of this method */
    public static readonly METHOD_CODE: int32 = 9809;

    /** The value of PI */
    private static readonly PI: float64 = Math.PI;

    /** Latitude of false origin */
    private _lat0: float64;
    /** Longitude of false origin */
    private _lon0: float64;
    /** Scale factor at natural origin */
    private _k0: float64;
    /** False easting */
    private _fe: float64;
    /** False northing */
    private _fn: float64;

    /** The parameters for the conformal sphere */
    private _e: float64;
    private _e2: float64;
    private _R: float64;
    private _n: float64;
    private _c: float64;
    private _chi0: float64;
    private _lambda0: float64;
    private _g: float64;
    private _h: float64;

    /**
       * Create a new projection.
       * @param parameters the values of the parameters.
       */
    public constructor(parameters: ParameterValueList) {
        super(ObliqueStereographic.METHOD_CODE, "Oblique Stereographic", parameters);
        /* Store the parameters */
        this._lat0 = (parameters != null) ? parameters.getValue(8801) : 0.0;
        this._lon0 = (parameters != null) ? parameters.getValue(8802) : 0.0;
        this._k0 = (parameters != null) ? parameters.getValue(8805) : 0.0;
        this._fe = (parameters != null) ? parameters.getValue(8806) : 0.0;
        this._fn = (parameters != null) ? parameters.getValue(8807) : 0.0;
    }

    /**
       * Create a new projection.
       * @param lat0 latitude of natural origin (radians).
       * @param lon0 longitude of natural origin (radians).
       * @param k0 scale factor at natural origin.
       * @param fe false easting.
       * @param fn false northing.
       */
    public static create(lat0: float64, lon0: float64, k0: float64, fe: float64, fn: float64): ObliqueStereographic {
        const projection: ObliqueStereographic = new ObliqueStereographic(null);
        projection._lat0 = lat0;
        projection._lon0 = lon0;
        projection._k0 = k0;
        projection._fe = fe;
        projection._fn = fn;
        return projection;
    }

    /**
       * Get the power of a number.
       */
    private static pow(n: float64, e: float64): float64 {
        return Math.exp(e * Math.log(n));
    }

    /**
       * Calculate sinus.
       */
    private static sin(a: float64): float64 {
        return Math.sin(a);
    }

    /**
       * Calculate cosinus.
       */
    private static cos(a: float64): float64 {
        return Math.cos(a);
    }

    /**
       * Calculate tangent.
       */
    private static tan(a: float64): float64 {
        return Math.tan(a);
    }

    /**
       * Calculate arcsinus.
       */
    private static asin(v: float64): float64 {
        return Math.asin(v);
    }

    /**
       * Calculate arctangent.
       */
    private static atan(v: float64): float64 {
        return Math.atan(v);
    }

    /**
       * Calculate log.
       */
    private static log(v: float64): float64 {
        return Math.log(v);
    }

    /**
       * Calculate exp.
       */
    private static exp(v: float64): float64 {
        return Math.exp(v);
    }

    /**
       * Initialize the projection.
       * @param ellipsoid the ellipsoid to use.
       * @return this projection (for convenience).
       */
    public initializeProjection(ellipsoid: Ellipsoid): ObliqueStereographic {
        /* Get the ellipsoid parameters */
        const a: float64 = ellipsoid.getA();
        this._e = ellipsoid.getE();
        /* Calculate conformat latitude (chi0) and longitude (lambda0) */
        this._e2 = this._e * this._e;
        const sinLat0: float64 = ObliqueStereographic.sin(this._lat0);
        const t0: float64 = 1.0 - this._e2 * sinLat0 * sinLat0;
        const rho0: float64 = a * (1 - this._e2) / ObliqueStereographic.pow(t0, 1.5);
        const nu0: float64 = a / ObliqueStereographic.pow(t0, 0.5);
        this._R = ObliqueStereographic.pow(rho0 * nu0, 0.5);
        this._n = ObliqueStereographic.pow(1.0 + (this._e2 * ObliqueStereographic.pow(ObliqueStereographic.cos(this._lat0), 4)) / (1.0 - this._e2), 0.5);
        const S1: float64 = (1.0 + sinLat0) / (1.0 - sinLat0);
        const S2: float64 = (1.0 - this._e * sinLat0) / (1.0 + this._e * sinLat0);
        const w1: float64 = ObliqueStereographic.pow(S1 * ObliqueStereographic.pow(S2, this._e), this._n);
        const sinChi0: float64 = (w1 - 1.0) / (w1 + 1.0);
        this._c = (this._n + sinLat0) * (1.0 - sinChi0) / ((this._n - sinLat0) * (1.0 + sinChi0));
        const w2: float64 = this._c * w1;
        this._chi0 = ObliqueStereographic.asin((w2 - 1.0) / (w2 + 1.0));
        this._lambda0 = this._lon0;
        /* For reverse calculation */
        this._g = 2.0 * this._R * this._k0 * ObliqueStereographic.tan(ObliqueStereographic.PI / 4.0 - this._chi0 / 2.0);
        this._h = 4.0 * this._R * this._k0 * ObliqueStereographic.tan(this._chi0) + this._g;
        /* Return the projection */
        return this;
    }

    /**
       * OperationMethod method.
       * @see OperationMethod#initialize
       */
    public override initialize(operation: Operation): void {
        this.initializeProjection(operation.getSourceCRS().getEllipsoid());
    }

    /**
       * OperationMethod interface method.
       * @see OperationMethod#forward
       */
    public forward(sourceCRS: CRS, source: Coordinate, targetCRS: CRS, target: Coordinate): void {
        /* Get the parameters */
        const lon: float64 = source.getX();
        const lat: float64 = source.getY();
        const sinLat: float64 = ObliqueStereographic.sin(lat);
        /* Calculate conformal latitude and longitude */
        const lambda: float64 = this._n * (lon - this._lambda0) + this._lambda0;
        const Sa: float64 = (1.0 + sinLat) / (1.0 - sinLat);
        const Sb: float64 = (1.0 - this._e * sinLat) / (1.0 + this._e * sinLat);
        const w: float64 = this._c * ObliqueStereographic.pow(Sa * ObliqueStereographic.pow(Sb, this._e), this._n);
        const chi: float64 = ObliqueStereographic.asin((w - 1.0) / (w + 1.0));
        /* Calculate easting and northing */
        const B: float64 = 1.0 + ObliqueStereographic.sin(chi) * ObliqueStereographic.sin(this._chi0) + ObliqueStereographic.cos(chi) * ObliqueStereographic.cos(this._chi0) * ObliqueStereographic.cos(lambda - this._lambda0);
        const E: float64 = this._fe + 2.0 * this._R * this._k0 * ObliqueStereographic.cos(chi) * ObliqueStereographic.sin(lambda - this._lambda0) / B;
        const N: float64 = this._fn + 2.0 * this._R * this._k0 * (ObliqueStereographic.sin(chi) * ObliqueStereographic.cos(this._chi0) - ObliqueStereographic.cos(chi) * ObliqueStereographic.sin(this._chi0) * ObliqueStereographic.cos(lambda - this._lambda0)) / B;
        /* Save the position */
        target.setX(E);
        target.setY(N);
        target.setZ(source.getZ()); // Keep the Z value
    }

    /**
       * OperationMethod interface method.
       * @see OperationMethod#reverse
       */
    public reverse(sourceCRS: CRS, source: Coordinate, targetCRS: CRS, target: Coordinate): void {
        /* Get the parameters */
        const E: float64 = target.getX() - this._fe;
        const N: float64 = target.getY() - this._fn;
        /* Calculate conformal latitude and longitude */
        const i: float64 = ObliqueStereographic.atan(E / (this._h + N));
        const j: float64 = ObliqueStereographic.atan(E / (this._g - N)) - i;
        const chi: float64 = this._chi0 + 2.0 * ObliqueStereographic.atan((N - E * ObliqueStereographic.tan(j / 2.0)) / (2.0 * this._R * this._k0));
        const lambda: float64 = j + 2.0 * i + this._lambda0;
        const lon: float64 = (lambda - this._lambda0) / this._n + this._lambda0;
        /* Iterate to get isometric (psi) and geodetic (phi) latitude */
        const sinChi: float64 = ObliqueStereographic.sin(chi);
        const psi: float64 = 0.5 * ObliqueStereographic.log((1.0 + sinChi) / (this._c * (1.0 - sinChi))) / this._n;
        let phiK: float64 = 2.0 * ObliqueStereographic.atan(ObliqueStereographic.exp(psi)) - ObliqueStereographic.PI / 2.0;
        for (let k: number = 1; k < 8; k++) {
            const esinPhi: float64 = this._e * ObliqueStereographic.sin(phiK);
            const psiK: float64 = ObliqueStereographic.log(ObliqueStereographic.tan(phiK / 2.0 + ObliqueStereographic.PI / 4.0) * ObliqueStereographic.pow((1.0 - esinPhi) / (1.0 + esinPhi), this._e / 2.0));
            const phiNextK: float64 = phiK - (psiK - psi) * ObliqueStereographic.cos(phiK) * (1.0 - esinPhi * esinPhi) / (1.0 - this._e2);
            const change: float64 = Math.abs(phiNextK - phiK);
            phiK = phiNextK;
            if (change < 1.0e-12) break; // normally after 4 iterations
        }
        /* Save the position */
        source.setX(lon);
        source.setY(phiK);
        source.setZ(target.getZ()); // Keep the Z value
    }
}
