/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./DiagnosticsSelector.css";
import React from "react";
import { DiagnosticsLoggerSeverity } from "@bentley/presentation-common";
import { DiagnosticsProps } from "@bentley/presentation-components";
import { consoleDiagnosticsHandler } from "@bentley/presentation-frontend";
import { ContextMenuDirection, GlobalContextMenu, PointProps } from "@bentley/ui-core";
import { LabeledSelect, ToggleSwitch } from "@itwin/itwinui-react";

export interface DiagnosticsSelectorProps {
  onDiagnosticsOptionsChanged: (diagnosticsOptions: DiagnosticsProps) => void;
}

export function DiagnosticsSelector(props: DiagnosticsSelectorProps) {
  const { onDiagnosticsOptionsChanged } = props;

  const [shouldMeasurePerformance, toggleMeasurePerformance] = React.useState(false);
  const [editorSeverity, setEditorSeverity] = React.useState("error");
  const [devSeverity, setDevSeverity] = React.useState("error");
  const result = React.useMemo((): DiagnosticsProps => ({
    ruleDiagnostics: {
      severity: editorSeverity as DiagnosticsLoggerSeverity,
      handler: consoleDiagnosticsHandler,
    },
    devDiagnostics: {
      perf: shouldMeasurePerformance,
      severity: devSeverity as DiagnosticsLoggerSeverity,
      handler: consoleDiagnosticsHandler,
    },
  }), [shouldMeasurePerformance, editorSeverity, devSeverity]);

  React.useEffect(() => {
    onDiagnosticsOptionsChanged(result);
    // note: intentionally empty dependency list - we only want `onDiagnosticsOptionsChanged` to be called on first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [position, setPosition] = React.useState<PointProps>();
  const onClose = React.useCallback(() => {
    setPosition(undefined);
    onDiagnosticsOptionsChanged(result);
  }, [onDiagnosticsOptionsChanged, result]);
  const handleMeasurePerformanceChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    toggleMeasurePerformance(e.target.checked);
  }, []);

  return (
    <React.Fragment>
      <button onClick={(e) => setPosition({ x: e.clientX, y: e.clientY })}>Diagnostics</button>
      <GlobalContextMenu
        className="DiagnosticsSelector"
        opened={undefined !== position}
        onOutsideClick={onClose}
        onEsc={onClose}
        identifier="Diagnostics"
        x={position?.x ?? 0}
        y={position?.y ?? 0}
        direction={ContextMenuDirection.BottomLeft}
        autoflip={false}
      >
        <LabeledSelect label="Editor severity"
          options={[
            { value: "error", label: "Error" },
            { value: "warning", label: "Warning" },
            { value: "info", label: "Info" },
          ]}
          value={editorSeverity}
          onChange={(newValue: string) => setEditorSeverity(newValue)} />
        <LabeledSelect label="Dev severity"
          options={[
            { value: "error", label: "Error" },
            { value: "warning", label: "Warning" },
            { value: "info", label: "Info" },
            { value: "debug", label: "Debug" },
            { value: "trace", label: "Trace" },
          ]}
          value={devSeverity}
          onChange={(newValue: string) => setDevSeverity(newValue)} />
        <ToggleSwitch label="Measure performance" labelPosition="right" checked={shouldMeasurePerformance} onChange={handleMeasurePerformanceChange} />
      </GlobalContextMenu>
    </React.Fragment>
  );
}
