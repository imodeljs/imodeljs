/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { ConfigurableCreateInfo, ConfigurableUiManager, NavigationAidControl } from "@bentley/ui-framework";

// -----------------------------------------------------------------------------
// Example Cube Navigation Aid Control
// -----------------------------------------------------------------------------

/** An example Navigation Aid control.
 */
export class CubeExampleNavigationAidControl extends NavigationAidControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);
    this.reactNode = <CubeExampleNavigationAid />;
  }

  public override getSize(): string | undefined { return "96px"; }
}

/** An example Navigation Aid displaying a 3D cube.
 */
class CubeExampleNavigationAid extends React.Component {
  private _htmlCanvas!: HTMLCanvasElement;

  public override render(): React.ReactNode {
    const canvasStyle: React.CSSProperties = {
      width: "100%",
      height: "100%",
    };

    return (
      <canvas className="unselectable" style={canvasStyle} ref={(element: any) => { this._htmlCanvas = element; }}
        onMouseDown={this._onMouseDown}
      >
      </canvas>
    );
  }

  private _onMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
  };

  public override componentDidMount() {
    this._draw();
  }

  // Animation function
  private _draw = () => {
    const canvas = this._htmlCanvas;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      const size = 100;
      const x1 = size;
      const x2 = size;
      const y = 50;
      const color = "#696969";

      // clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // draw the cube
      this.drawCube(
        canvas.width / 2,
        canvas.height / 2 + y * 1.5,
        x1,
        x2,
        y,
        color,
      );
    }
  };

  // Colour adjustment function
  // Nicked from http://stackoverflow.com/questions/5560248
  private shadeColor(color: string, percent: number) {
    color = color.substr(1);
    const num = parseInt(color, 16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) + amt,
      G = ((num >> 8) & 0x00FF) + amt,
      B = (num & 0x0000FF) + amt;
    return `#${(0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1)}`;
  }

  // Draw a cube to the specified specs
  private drawCube(x: number, y: number, wx: number, wy: number, h: number, color: string) {
    const canvas = this._htmlCanvas;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - wx, y - wx * 0.5);
      ctx.lineTo(x - wx, y - h - wx * 0.5);
      ctx.lineTo(x, y - h * 1);
      ctx.closePath();
      ctx.fillStyle = this.shadeColor(color, -10);
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + wy, y - wy * 0.5);
      ctx.lineTo(x + wy, y - h - wy * 0.5);
      ctx.lineTo(x, y - h * 1);
      ctx.closePath();
      ctx.fillStyle = this.shadeColor(color, 10);
      ctx.strokeStyle = this.shadeColor(color, 50);
      ctx.stroke();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x - wx, y - h - wx * 0.5);
      ctx.lineTo(x - wx + wy, y - h - (wx * 0.5 + wy * 0.5));
      ctx.lineTo(x + wy, y - h - wy * 0.5);
      ctx.closePath();
      ctx.fillStyle = this.shadeColor(color, 20);
      ctx.strokeStyle = this.shadeColor(color, 60);
      ctx.stroke();
      ctx.fill();
    }
  }
}

ConfigurableUiManager.registerControl("CubeExampleNavigationAid", CubeExampleNavigationAidControl);
