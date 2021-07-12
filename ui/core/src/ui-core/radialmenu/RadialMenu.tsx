/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RadialMenu
 */

import "./RadialMenu.scss";
import classnames from "classnames";
import * as React from "react";
import { SpecialKey } from "@bentley/ui-abstract";
import { Icon, IconSpec } from "../icons/IconComponent";
import { Point } from "../utils/Point";
import { CommonProps } from "../utils/Props";
import { AnnularSector, Annulus } from "./Annulus";

/** Properties for [[RadialMenu]]
 * @beta
 */
export interface RadialMenuProps extends CommonProps {
  /** Whether to show RadialMenu */
  opened: boolean;
  /** Radius of inner portion of RadialMenu */
  innerRadius: number;
  /** Radius of outer portion of RadialMenu */
  outerRadius: number;
  /** Optional parameter to specify left position in viewport. */
  left?: number | string;
  /** Optional parameter to specify top position in viewport. */
  top?: number | string;
  /** Whether to rotate labels according to location on the RadialMenu, or to keep labels upright.
   * Default: false
   */
  labelRotate?: boolean;
  /** Which child RadialButton to highlight */
  selected?: number;
  /** triggered in case of onClick events anywhere other than radial menu */
  onBlur?: (event: any) => any;
  /** triggered onKeyUp for <Esc> key */
  onEsc?: (event: any) => any;
}

/** @internal */
interface RadialMenuState {
  sectors: AnnularSector[];
}

/**
 * A context menu arranged in a radial layout.
 * @beta
 */
export class RadialMenu extends React.Component<RadialMenuProps, RadialMenuState> {
  private _root: HTMLDivElement | null = null;
  private _selectedButton: RadialButton | null = null;
  public static defaultProps: Partial<RadialMenuProps> = {
    labelRotate: false,
    selected: -1,
  };

  /** @internal */
  public override readonly state: Readonly<RadialMenuState> = {
    sectors: [],
  };

  constructor(props: RadialMenuProps) {
    super(props);
  }

  public override render(): JSX.Element {
    const width = 2 * (this.props.outerRadius + 1);
    let x = this.props.left, y = this.props.top;

    if (this.props.left && this.props.top && typeof this.props.left === "number" && typeof this.props.top === "number") {
      x = this.props.left;
      y = this.props.top;

      if (x < 0)
        x = 0;
      if (x > window.innerWidth - width)
        x = window.innerWidth - width;
      if (y < 0)
        y = 0;
      if (y > window.innerHeight - width)
        y = window.innerHeight - width;
    }

    const divStyle: React.CSSProperties = { left: x, top: y, ...this.props.style };

    return (
      <div
        ref={(el) => { this._root = el; }}
        className={classnames("core-radial-menu", { opened: this.props.opened }, this.props.className)}
        style={divStyle}
        data-testid="core-radial-menu"
      >
        <svg
          xmlns="http://w3.org/2000/svg" version="1.1"
          width={width} height={width}
          className={"core-radial-menu-container"}>
          {React.Children.map(this.props.children, (child, index) => {
            // istanbul ignore next
            if (!child || typeof child !== "object" || !("props" in child))
              return child;

            const childElement = (child as React.ReactElement<any>);
            return React.cloneElement(childElement, {
              key: index,
              ref: (el: any) => {
                if (this.props.selected === index)
                  this._selectedButton = el;
              },
              selected: index === this.props.selected,
              labelRotate: childElement.props.labelRotate || this.props.labelRotate,
              annularSector: this.state.sectors[index],
            });
          })}
        </svg>
      </div>
    );
  }

  public override componentDidMount() {
    this._generateAnnularSectors();

    setTimeout(() => {
      window.addEventListener("keyup", this._handleKeyUp);
      window.addEventListener("mouseup", this._handleClick);
    });
  }

  public override componentWillUnmount() {
    window.removeEventListener("keyup", this._handleKeyUp);
    window.removeEventListener("mouseup", this._handleClick);
  }

  public override componentDidUpdate(prevProps: RadialMenuProps) {
    if (prevProps.innerRadius !== this.props.innerRadius || prevProps.outerRadius !== this.props.outerRadius) {
      this._generateAnnularSectors();
    }
  }

  private _handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === SpecialKey.Escape && this.props.onEsc)
      this.props.onEsc(event);
  };

  private _handleClick = (event: MouseEvent) => {
    if (event.target instanceof HTMLElement && this._root && !event.target.contains(this._root) && this.props.onBlur)
      this.props.onBlur(event);
  };

  /** Manually call onSelect of highlighted button. */
  public select = () => {
    // istanbul ignore else
    if (this._selectedButton)
      this._selectedButton.select();
  };

  private _generateAnnularSectors = () => {
    const n = React.Children.count(this.props.children);
    const angle = 2 * Math.PI / n;
    const outer = this.props.outerRadius;
    const inner = this.props.innerRadius;

    const offset = - Math.PI / 8;
    const annulus = new Annulus(new Point(outer + 1, outer + 1), inner + 1, outer - 1);
    const sectors: AnnularSector[] = [];
    for (let i = 0; i < n; i++) {
      sectors.push(new AnnularSector(annulus, angle * i + offset, angle * (i + 1) + offset));
    }
    this.setState({ sectors });
  };
}

/** Properties for [[RadialButton]] component
 * @beta
 */
export interface RadialButtonProps extends CommonProps {
  /** Whether label is rotated to radial menu. Default: Inherit */
  labelRotate?: boolean;
  /** which icon to display in on the menu button */
  icon?: IconSpec;
  /** @internal */
  annularSector?: AnnularSector;
  /** listens to any onClick event, or any select event, which can be triggered by the select() method. */
  onSelect?: (e: any) => any;
  /** Whether item is highlighted */
  selected?: boolean;
}

/** @internal */
interface RadialButtonState {
  hover: boolean;
}

/**
 * Button for use within a [[RadialMenu]]
 * @beta
 */
export class RadialButton extends React.Component<RadialButtonProps, RadialButtonState> {

  /** @internal */
  public override readonly state: Readonly<RadialButtonState> = { hover: this.props.selected || false };

  constructor(props: RadialButtonProps) {
    super(props);
  }

  public override render(): JSX.Element {
    const sector = this.props.annularSector;
    let p = new Point();
    let size = 0;
    let t = "";
    let path = "";

    if (sector) {
      size = sector.start.p1.getDistanceTo(sector.end.p2) * 2;
      path = sector.path;

      const parent = sector.parent;
      const { x: cx, y: cy } = parent.center;
      const r = (parent.inner.radius + parent.outer.radius) / 2;
      const angle = (sector.startAngle + sector.endAngle) / 2;
      p = new Point(cx + r * Math.cos(angle), cy + r * Math.sin(angle));

      if (this.props.labelRotate) {
        let a = angle * 180 / Math.PI + 90;
        while (a > 180)
          a -= 360;
        while (a < -180)
          /* istanbul ignore next */
          a += 360;
        if (a > 90)
          a -= 180;
        if (a < -90)
          a += 180;
        t = `rotate(${a} ${p.x}, ${p.y})`;
      }
    }

    return (
      <g
        onMouseOver={this._handleMouseOver}
        onMouseOut={this._handleMouseOut}
        onClick={this._handleClick}>
        <path
          className={classnames("core-radial-menu-sector", { selected: this.state.hover }, this.props.className)}
          style={this.props.style}
          d={path}>
        </path>
        <foreignObject transform={t} x={p.x - size / 2} y={p.y - 16} width={size} height={size} className={"core-radial-menu-button-svg"}>
          <div {...{ xmlns: "http://www.w3.org/1999/xhtml" }} className={"core-radial-menu-button-container"}>
            <div className="core-radial-menu-button-icon">
              <Icon iconSpec={this.props.icon} />
            </div>
            <div className={"core-radial-menu-button-content"}>
              {this.props.children}
            </div>
          </div>
        </foreignObject>
      </g>
    );
  }

  /** Manually call this.props.onSelect */
  public select = () => {
    // istanbul ignore else
    if (this.props.onSelect)
      this.props.onSelect(undefined);
  };

  private _handleClick = (event: React.MouseEvent<SVGElement>) => {
    // istanbul ignore else
    if (this.props.onSelect)
      this.props.onSelect(event);
  };

  private _handleMouseOver = (_event: React.MouseEvent<SVGElement>) => {
    this.setState({ hover: true });
  };

  private _handleMouseOut = (_event: React.MouseEvent<SVGElement>) => {
    this.setState({ hover: false });
  };
}
