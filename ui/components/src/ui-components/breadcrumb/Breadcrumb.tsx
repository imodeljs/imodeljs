/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Breadcrumb
 */

import "./Breadcrumb.scss";
import classnames from "classnames";
import * as _ from "lodash";
import * as React from "react";
import { using } from "@bentley/bentleyjs-core";
import { PropertyRecord, SpecialKey } from "@bentley/ui-abstract";
import {
  CommonProps, ContextMenu, ContextMenuItem, DialogButtonType, MessageBox, MessageSeverity, SplitButton, withOnOutsideClick,
} from "@bentley/ui-core";
import { getPropertyRecordAsString } from "../common/getPropertyRecordAsString";
import { PropertyValueRendererManager } from "../properties/ValueRendererManager";
import {
  BeInspireTree, BeInspireTreeEvent, BeInspireTreeNode, BeInspireTreeNodeConfig, BeInspireTreeNodes, MapPayloadToInspireNodeCallback, toNodes,
} from "../tree/deprecated/component/BeInspireTree";
import {
  DelayLoadedTreeNodeItem, ImmediatelyLoadedTreeNodeItem, isTreeDataProviderInterface, TreeDataProvider, TreeNodeItem,
} from "../tree/TreeDataProvider";
import { UiComponents } from "../UiComponents";
import { BreadcrumbPath, BreadcrumbUpdateEventArgs } from "./BreadcrumbPath";

/* eslint-disable deprecation/deprecation */
// cspell:ignore itree autocompleting

/** @internal */
export type BreadcrumbNodeRenderer = (props: BreadcrumbNodeProps, node?: TreeNodeItem, parent?: TreeNodeItem) => React.ReactNode;

/** Properties for [[Breadcrumb]] component
 * @beta
 */
export interface BreadcrumbProps extends CommonProps {
  /** Manager to coordinate state between Breadcrumb element and BreadcrumbDetails element. */
  path?: BreadcrumbPath;
  /** Data provider for tree content  */
  dataProvider: TreeDataProvider;
  /** Initial current node */
  initialCurrent?: TreeNodeItem;
  /** Character used to separate discrete tree nodes in Breadcrumb text mode. Default: "\\" */
  delimiter?: string;
  /** Width in pixels, if number, and in specified css units, if string. Default: "15em" */
  width?: number | string;
  /** Whether to show up-dir directory pop button on the left. Default: true */
  showUpDir?: boolean;
  /** Which BreadcrumbMode to initially start with. Default: BreadcrumbMode.Dropdown */
  initialBreadcrumbMode?: BreadcrumbMode;
  /** Whether to show white background and border. Default: true */
  background?: boolean;
  /** Static breadcrumb element. Default: false */
  staticOnly?: boolean;
  /** Disable plain-text input for the breadcrumb navigation. Default: false */
  dropdownOnly?: boolean;
  /** Whether to disallow navigation to leaf nodes (nodes with no children). Default: true */
  parentsOnly?: boolean;
  /** Callback triggered when child node is loaded with an asynchronous dataProvider. */
  onChildrenLoaded?: (parent: TreeNodeItem, children: TreeNodeItem[]) => void;
  /** Callback triggered when root nodes are loaded with an asynchronous dataProvider. */
  onRootNodesLoaded?: (nodes: TreeNodeItem[]) => void;

  /** @internal */
  renderNode?: BreadcrumbNodeRenderer;
  /** @internal */
  onRender?: () => void;
  /** @internal */
  expandedNodes?: boolean;
}

/** Enum for Breadcrumb Mode
 * @beta
 */
export enum BreadcrumbMode {
  Dropdown = "dropdown",
  Input = "input",
}

/** @internal */
interface BreadcrumbState {
  prev: {
    dataProvider: TreeDataProvider;
    modelReady: boolean;
  };
  model: BeInspireTree<TreeNodeItem>;
  modelReady: boolean;
  width: number | string;
  current?: TreeNodeItem;
  currentMode: BreadcrumbMode;
  pathString: string;
}

/**
 * Breadcrumb navigation component, with two discrete modes: text mode, and dropdown mode.
 * Text mode includes autocomplete suggestions.
 * Both dropdown and text mode support arrow and tab navigation.
 * @beta
 */
export class Breadcrumb extends React.Component<BreadcrumbProps, BreadcrumbState> {
  private _mounted: boolean = false;

  /** @internal */
  public static defaultProps: Partial<BreadcrumbProps> = {
    delimiter: "\\",
    background: true,
    initialBreadcrumbMode: BreadcrumbMode.Dropdown,
    showUpDir: true,
    parentsOnly: true,
    width: "",
  };

  /** @internal */
  public override readonly state: Readonly<BreadcrumbState>;

  /** @internal */
  constructor(props: BreadcrumbProps) {
    super(props);

    this.state = {
      prev: {
        dataProvider: props.dataProvider,
        modelReady: false,
      },
      model: Breadcrumb.createModel(props),
      modelReady: false,
      width: props.width!,
      currentMode: props.initialBreadcrumbMode!,
      current: props.initialCurrent,
      pathString: "",
    };
  }

  private static createModel(props: BreadcrumbProps) {
    return new BeInspireTree<TreeNodeItem>({
      dataProvider: props.dataProvider,
      mapPayloadToInspireNodeConfig: Breadcrumb.inspireNodeFromTreeNodeItem,
    });
  }

  /** @internal */
  public static getDerivedStateFromProps(props: BreadcrumbProps, state: BreadcrumbState): BreadcrumbState | null {
    const providerChanged = (props.dataProvider !== state.prev.dataProvider);

    // create derived state that just updates `prev` values
    const derivedState: BreadcrumbState = {
      ...state,
      prev: {
        ...state.prev,
        dataProvider: props.dataProvider,
        modelReady: state.modelReady,
      },
    };

    // in case provider changed, have to re-create `model` and reset `modelReady`
    if (providerChanged) {
      derivedState.model = Breadcrumb.createModel(props);
      derivedState.modelReady = false;
    }

    return derivedState;
  }

  /** @internal */
  public override componentDidMount() {
    this._mounted = true;
    this.assignModelListeners(this.state.model);
    this.assignDataProviderListeners(this.props.dataProvider);

    if (this.props.path) {
      this.props.path.setDataProvider(this.props.dataProvider);
      this.props.path.BreadcrumbUpdateEvent.addListener(this._handleUpdate);
    }

    /* istanbul ignore next */
    if (this.props.onRender)
      this.props.onRender();
  }

  /** @internal */
  public override componentWillUnmount() {
    if (this.props.path)
      this.props.path.BreadcrumbUpdateEvent.removeListener(this._handleUpdate);
    this.dropModelListeners(this.state.model);
    this.dropDataProviderListeners(this.props.dataProvider);
    this._mounted = false;
  }

  /** @internal */
  public override shouldComponentUpdate(nextProps: BreadcrumbProps, nextState: BreadcrumbState): boolean {
    if (this.state.modelReady !== nextState.modelReady || this.state.model !== nextState.model) {
      // always render when modelReady or model changes
      return true;
    }

    if (!nextState.modelReady) {
      // if we got here and model is not ready - don't render
      return false;
    }

    // otherwise, render when any of the following props / state change
    return this.props.renderNode !== nextProps.renderNode
      || this.props.dataProvider !== nextProps.dataProvider
      || this.props.background !== nextProps.background
      || this.props.dropdownOnly !== nextProps.dropdownOnly
      || this.props.parentsOnly !== nextProps.parentsOnly
      || this.props.showUpDir !== nextProps.showUpDir
      || this.state.current !== nextState.current
      || this.state.pathString !== nextState.pathString
      || this.state.currentMode !== nextState.currentMode
      || this.state.model.visible().some((n) => n.isDirty());
  }

  /** @internal */
  public override componentDidUpdate(prevProps: BreadcrumbProps, prevState: BreadcrumbState) {
    if (this.state.model !== prevState.model) {
      this.dropModelListeners(prevState.model);
      this.assignModelListeners(this.state.model);
    }

    if (this.props.dataProvider !== prevProps.dataProvider) {
      this.dropDataProviderListeners(prevProps.dataProvider);
      this.assignDataProviderListeners(this.props.dataProvider);
    }

    /* istanbul ignore next */
    if (this.props.onRender)
      this.props.onRender();
  }

  private assignModelListeners(model: BeInspireTree<TreeNodeItem>) {
    model.on(BeInspireTreeEvent.ChangesApplied, this._onModelChanged);
    model.on(BeInspireTreeEvent.ModelLoaded, this._onModelLoaded);
    model.on(BeInspireTreeEvent.ChildrenLoaded, this._onChildrenLoaded);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    model.ready.then(() => {
      // istanbul ignore else
      if (model === this.state.model)
        this._onModelReady();
    });
  }

  private dropModelListeners(model: BeInspireTree<TreeNodeItem>) {
    model.removeAllListeners();
  }

  private assignDataProviderListeners(provider: TreeDataProvider) {
    if (isTreeDataProviderInterface(provider) && provider.onTreeNodeChanged) {
      provider.onTreeNodeChanged.addListener(this._onTreeNodeChanged);
    }
  }

  private dropDataProviderListeners(provider: TreeDataProvider) {
    if (isTreeDataProviderInterface(provider) && provider.onTreeNodeChanged) {
      provider.onTreeNodeChanged.removeListener(this._onTreeNodeChanged);
    }
  }

  private _handleUpdate = (args: BreadcrumbUpdateEventArgs) => {
    if (args.currentNode && this._mounted) {
      const current = this.state.model.node(args.currentNode.id);
      if (current) {
        const p = current.getTextualHierarchy().join(this.props.delimiter);
        this.setState({ current: args.currentNode, pathString: p });
      }
    } else {
      this.setState({ current: undefined, pathString: "" });
    }
  };

  private _onModelLoaded = (rootNodes: BeInspireTreeNodes<TreeNodeItem>) => {
    if (this.props.onRootNodesLoaded)
      this.props.onRootNodesLoaded(rootNodes.map((n) => n.payload!));
    const current = this.state.current ? this.state.model.node(this.state.current.id) : undefined;
    const p = current ? current.getTextualHierarchy().join(this.props.delimiter) : "";
    if (p !== this.state.pathString)
      this.setState({ pathString: p });
  };

  private _onChildrenLoaded = (parentNode: BeInspireTreeNode<TreeNodeItem>) => {
    const children = parentNode.getChildren();
    if (this.props.onChildrenLoaded)
      this.props.onChildrenLoaded(parentNode.payload!, toNodes<TreeNodeItem>(children).map((c) => c.payload!));
    const current = this.state.current ? this.state.model.node(this.state.current.id) : undefined;
    const p = current ? current.getTextualHierarchy().join(this.props.delimiter) : "";
    if (p !== this.state.pathString)
      this.setState({ pathString: p });
  };

  private _onModelChanged = () => {
    // just re-set the model to initiate update
    this.setState((prev) => ({ model: prev.model }));
  };

  private _onModelReady = () => {
    // istanbul ignore else
    if (this._mounted) {
      const current = this.state.current ? this.state.model.node(this.state.current.id) : undefined;
      this.setState((_prevState, props) => ({ modelReady: true, pathString: current ? current.getTextualHierarchy().join(props.delimiter) : "" }));
    }
  };

  private _onTreeNodeChanged = (_items: Array<TreeNodeItem | undefined>) => {
    using(this.state.model.pauseRendering(), async (_r) => { // eslint-disable-line @typescript-eslint/no-floating-promises
      await this.state.model.reload();
    });
  };

  private static inspireNodeFromTreeNodeItem(item: TreeNodeItem, remapper: MapPayloadToInspireNodeCallback<TreeNodeItem>): BeInspireTreeNodeConfig {
    const node: BeInspireTreeNodeConfig = {
      id: item.id,
      text: getPropertyRecordAsString(item.label),
      itree: {
        state: { collapsed: false },
      },
    };
    if (item.icon)
      node.itree!.icon = item.icon;
    if ((item as DelayLoadedTreeNodeItem).hasChildren)
      node.children = true;
    else if ((item as ImmediatelyLoadedTreeNodeItem).children)
      node.children = (item as ImmediatelyLoadedTreeNodeItem).children!.map((p) => remapper(p, remapper));
    return node;
  }

  /** @internal */
  public override render(): React.ReactNode {
    const classNames = classnames("components-breadcrumb", this.props.background && "background", this.props.className);

    if (!this.state.modelReady) {
      return (
        <div className={classNames} style={this.props.style} />
      );
    }
    const node = this.state.current ? this.state.model.node(this.state.current.id) : undefined;
    return (
      <div
        className={classNames} style={this.props.style}>
        <div className="components-breadcrumb-head"
          data-testid="components-breadcrumb-dropdown-input-parent">
          {this.props.dropdownOnly || this.props.staticOnly ?
            <BreadcrumbDropdown
              tree={this.state.model}
              node={node}
              onNodeChange={this._handleNodeChange}
              onInputStart={this._setInput}
              renderNode={this.props.renderNode}
              staticOnly={this.props.staticOnly}
              showUpDir={this.props.showUpDir}
              parentsOnly={this.props.parentsOnly}
              width={this.props.width!}
              expandedNode={this.props.expandedNodes} /> :
            <InputSwitch
              tree={this.state.model}
              node={node}
              pathString={this.state.pathString}
              currentMode={this.state.currentMode}
              onInputStart={this._setInput}
              onInputCancel={this._setDropdown}
              onNodeChange={this._handleNodeChange}
              width={this.props.width!}
              showUpDir={this.props.showUpDir}
              parentsOnly={this.props.parentsOnly}
              delimiter={this.props.delimiter!}
              onOutsideClick={this._setDropdown}
              renderNode={this.props.renderNode}
              expandedNode={this.props.expandedNodes} />
          }
        </div>
      </div>
    );
  }

  private _setDropdown = () => this.setState({ currentMode: BreadcrumbMode.Dropdown });
  private _setInput = () => this.setState({ currentMode: BreadcrumbMode.Input });

  private _handleNodeChange = (node: TreeNodeItem | undefined) => {
    if (this.props.path)
      this.props.path.setCurrentNode(node);
    else {
      if (!node) {
        this.setState({ current: undefined, pathString: "" });
      } else {
        const current = this.state.current ? this.state.model.node(this.state.current.id) : undefined;
        const p = current ? current.getTextualHierarchy().join(this.props.delimiter) : "";
        this.setState({ current: node, pathString: p });
      }
    }
    if (this.state.currentMode !== BreadcrumbMode.Dropdown)
      this._setDropdown();
  };
}

/** @internal */
export interface InputSwitchProps {
  tree: BeInspireTree<TreeNodeItem>;
  node?: BeInspireTreeNode<TreeNodeItem>;
  pathString: string;
  currentMode: BreadcrumbMode;
  onInputStart?: () => void;
  onInputCancel: () => void;
  onNodeChange: (node?: TreeNodeItem) => void;
  showUpDir?: boolean;
  parentsOnly?: boolean;
  renderNode?: BreadcrumbNodeRenderer;
  width: number | string;
  delimiter: string;
  expandedNode?: boolean;
}

/** @internal */
export class InputSwitchComponent extends React.PureComponent<InputSwitchProps> {
  public override render(): React.ReactNode {
    const { currentMode, tree, node, onInputStart, onInputCancel, onNodeChange, renderNode, width, showUpDir, delimiter, expandedNode } = this.props;
    switch (currentMode) {
      case BreadcrumbMode.Dropdown:
        return <BreadcrumbDropdown tree={tree} node={node} onNodeChange={onNodeChange} renderNode={renderNode} onInputStart={onInputStart}
          parentsOnly={this.props.parentsOnly} showUpDir={showUpDir} width={width} expandedNode={expandedNode} />;
      case BreadcrumbMode.Input:
        return <BreadcrumbInput tree={tree} node={node} onNodeChange={onNodeChange} onCancel={onInputCancel}
          parentsOnly={this.props.parentsOnly} delimiter={delimiter} width={width} pathString={this.props.pathString} />;
      default:
        return <div data-testid="components-breadcrumb-error-unknown-mode">{UiComponents.translate("breadcrumb.errorUnknownMode")}</div>;
    }
  }
}
/** @internal */
const InputSwitch = withOnOutsideClick(InputSwitchComponent); // eslint-disable-line @typescript-eslint/naming-convention

/** @internal */
export interface BreadcrumbInputProps {
  width: number | string;
  delimiter?: string;

  onCancel: () => void;
  onNodeChange: (node: TreeNodeItem | undefined) => void;
  parentsOnly?: boolean;

  tree: BeInspireTree<TreeNodeItem>;
  node?: BeInspireTreeNode<TreeNodeItem>;

  pathString: string;
}

/** @internal */
export interface BreadcrumbInputState {
  autocompleting: boolean;
  autocompleteList: string[];
  messageBoxOpened: boolean;
}

/** @internal */
export class BreadcrumbInput extends React.Component<BreadcrumbInputProps, BreadcrumbInputState> {
  private _inputElement: HTMLInputElement | null = null;
  private _autocomplete: ContextMenu | null = null;
  private _mounted: boolean = false;

  /** @internal */
  public override readonly state: Readonly<BreadcrumbInputState> = {
    autocompleting: false,
    autocompleteList: [],
    messageBoxOpened: false,
  };

  public override render(): JSX.Element {
    return (
      <div className="components-breadcrumb-input-root" data-testid="components-breadcrumb-input-root">
        <input
          className="components-breadcrumb-input"
          data-testid="components-breadcrumb-input"
          type="text"
          ref={(e) => { this._inputElement = e; }}
          style={{ width: this.props.width }}
          onKeyDown={this._handleKeyDown} onKeyUp={this._handleKeyUp}
          onChange={this._handleChange} onPaste={this._handleChange} onCut={this._handleChange} onFocus={this._handleChange} onClick={this._handleChange}
          spellCheck={false}></input>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <div className="components-breadcrumb-close icon icon-close" data-testid="components-breadcrumb-input-close" onClick={this._handleClose}
          role="button" tabIndex={-1} />
        <ContextMenu
          ref={(el) => { this._autocomplete = el; }}
          style={{ width: "100%" }}
          opened={this.state.autocompleting}
          edgeLimit={false}
          selectedIndex={0} floating={false} autoflip={false}
          onEsc={() => {
            // istanbul ignore else
            if (this._inputElement)
              this._inputElement.focus();
          }}
        >
          {this.state.autocompleteList.map((listItem, index) => {
            let l = 0;
            // istanbul ignore else
            if (this._inputElement) {
              l = this._inputElement.value.length;
            }
            return (
              <ContextMenuItem
                key={index}
                onSelect={(event) => {
                  // istanbul ignore else
                  if (this._inputElement) {
                    this._inputElement.value = listItem;
                    this._inputElement.focus();
                    this._inputElement.setSelectionRange(listItem.length, listItem.length);

                    const autocompleteStr = this._inputElement.value.substring(0, this._inputElement.selectionEnd!);
                    this._getAutocompleteList(autocompleteStr).then((list) => { // eslint-disable-line @typescript-eslint/no-floating-promises
                      // istanbul ignore else
                      if (this._mounted)
                        this.setState({
                          autocompleting: false,
                          autocompleteList: list,
                        });
                    });
                    event.stopPropagation();
                  }
                }}>
                <span className="components-breadcrumb-selected">{listItem.substr(0, l)}</span>{listItem.substr(l)}
              </ContextMenuItem>
            );
          })}
        </ContextMenu>
        <MessageBox opened={this.state.messageBoxOpened} modal={false} onClose={this._handleMessageBoxClose} severity={MessageSeverity.Warning} buttonCluster={[{ type: DialogButtonType.OK, onClick: this._handleMessageBoxClose }]}>
          {UiComponents.translate("breadcrumb.invalidBreadcrumbPath")}
        </MessageBox>
      </div>
    );
  }

  private _handleMessageBoxClose = () => {
    this.setState({ messageBoxOpened: false });
  };

  /** @internal */
  public override componentDidMount() {
    this._mounted = true;
    // istanbul ignore else
    if (this._inputElement) {
      const activeWindow = this._inputElement.ownerDocument.defaultView;
      activeWindow && activeWindow.addEventListener("click", this._handleClick);
      this._inputElement.value = this.props.pathString;
      this._inputElement.focus();
    }
  }

  /** @internal */
  public override componentWillUnmount() {
    // istanbul ignore else
    if (this._inputElement) {
      const activeWindow = this._inputElement.ownerDocument.defaultView;
      activeWindow && activeWindow.removeEventListener("click", this._handleClick);
    }
    this._mounted = false;
  }

  private _handleClose = () => {
    this.props.onCancel();
    this.setState({ autocompleting: false });
  };

  private _getAutocompleteList = async (path: string) => {
    const node = await this._findChildParentPartial(path);
    if (node) {
      const baseString = node.getTextualHierarchy().join(this.props.delimiter);
      const children = node.getChildren();
      const parentChildren = this.props.parentsOnly ? children.filter((child) => child.hasOrWillHaveChildren()) : children;
      const strList = parentChildren.map((n) => baseString + this.props.delimiter! + n.toString());
      return strList.filter((e) => e.substr(0, path.length) === path);
    } else {
      const nodes = this.props.tree.nodes();
      const parentRoots = this.props.parentsOnly ? nodes.filter((child) => child.hasOrWillHaveChildren()) : nodes;
      const strList = parentRoots.map((n) => n.toString() + this.props.delimiter!);
      return strList.filter((e) => e.substr(0, path.length) === path);
    }
  };

  private _findChildUserInput = async (p: string): Promise<BeInspireTreeNode<TreeNodeItem> | undefined> => {
    const delimiter = this.props.delimiter!;
    if (p.endsWith(delimiter)) // strip last delimiter if at end
      p = p.substr(0, p.length - delimiter.length);
    const root = this.props.tree.nodes();
    for (const node of root) {
      const found = await this._find(node, p);
      if (found)
        return found;
    }
    return undefined;
  };
  private _findChildParentPartial = async (p: string): Promise<BeInspireTreeNode<TreeNodeItem> | undefined> => {
    const delimiter = this.props.delimiter!;
    const lastDel = p.lastIndexOf(delimiter);
    if (lastDel !== -1) // strip last delimiter and everything after
      p = p.substring(0, lastDel);
    else
      return undefined;
    const root = this.props.tree.nodes();
    for (const node of root) {
      const found = await this._find(node, p);
      if (found)
        return found;
    }
    return undefined;
  };
  private _find = async (node: BeInspireTreeNode<TreeNodeItem>, p: string): Promise<BeInspireTreeNode<TreeNodeItem> | undefined> => {
    const delimiter = this.props.delimiter!;
    // remove leading delimiter
    if (p.indexOf(delimiter) === 0)
      p = p.substr(delimiter.length);
    const { text } = node;
    if (text === p) {
      return node;
    }
    if (p.indexOf(text) === 0 && node.hasOrWillHaveChildren()) {
      const children = node.getChildren();
      for (const child of children) {
        const n = await this._find(child as BeInspireTreeNode<TreeNodeItem>, p.substr(text.length));
        if (n)
          return n;
      }
    }
    return undefined;
  };

  private _handleClick = (event: MouseEvent): void => {
    // istanbul ignore else
    if (this._autocomplete) {
      // istanbul ignore else
      if (this._inputElement && event.target === this._inputElement) {
        this.setState({ autocompleting: false });
        this._inputElement.focus();
      }
    }
  };

  private _handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case SpecialKey.ArrowUp:
      case SpecialKey.ArrowDown:
        event.preventDefault();
    }
  };
  private _handleKeyUp = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case SpecialKey.Escape:
        // istanbul ignore else
        if (this._mounted)
          this.setState({ autocompleting: false });
        break;
      case SpecialKey.ArrowUp:
      case SpecialKey.ArrowDown:
        event.preventDefault();
        // istanbul ignore else
        if (this._autocomplete && this.state.autocompleteList.length > 0) {
          this._autocomplete.focus();
          // istanbul ignore else
          if (this._mounted)
            this.setState({ autocompleting: true });
        }
        break;
      case SpecialKey.Enter:
        // istanbul ignore else
        if (this._inputElement) {
          const path = this._inputElement.value;
          if (path === "" || path === this.props.delimiter!) {
            this.props.onNodeChange(undefined);
            // istanbul ignore else
            if (this._mounted)
              this.setState({ autocompleting: false });
          } else {
            const node = await this._findChildUserInput(path);
            if (node === undefined)
              this.setState({ messageBoxOpened: true });
            else
              this.props.onNodeChange(node.payload);
          }
        }
        break;
    }
  };

  private _handleChange = (): void => {
    // istanbul ignore else
    if (this._inputElement) {
      const autocompleteStr = this._inputElement.value.substring(0, this._inputElement.selectionEnd!);
      this._getAutocompleteList(autocompleteStr).then((list) => { // eslint-disable-line @typescript-eslint/no-floating-promises
        if (this._mounted)
          this.setState({
            autocompleting: list.length > 0,
            autocompleteList: list,
          });
      });
    }
  };
}

/** @internal */
interface BreadcrumbDropdownProps {
  tree: BeInspireTree<TreeNodeItem>;
  node?: BeInspireTreeNode<TreeNodeItem>;
  onInputStart?: () => void;
  onNodeChange: (node: TreeNodeItem | undefined) => void;
  staticOnly?: boolean;
  parentsOnly?: boolean;
  delimiter?: string;
  width: number | string;
  showUpDir?: boolean;
  renderNode?: BreadcrumbNodeRenderer;
  expandedNode?: boolean;
}

/** @internal */
class BreadcrumbDropdown extends React.Component<BreadcrumbDropdownProps> {

  /** @internal */
  public override componentDidMount() {
    this.props.tree.on(BeInspireTreeEvent.ChildrenLoaded, this._onChildrenLoaded);
    this.props.tree.on(BeInspireTreeEvent.ModelLoaded, this._onModelLoaded);
  }

  /** @internal */
  public override componentWillUnmount() {
    this.props.tree.removeListener(BeInspireTreeEvent.ChildrenLoaded, this._onChildrenLoaded);
    this.props.tree.removeListener(BeInspireTreeEvent.ModelLoaded, this._onModelLoaded);
  }

  private _onModelLoaded = (_rootNodes: BeInspireTreeNodes<TreeNodeItem>) => {
    this.forceUpdate();
  };

  private _onChildrenLoaded = (_parentNode: BeInspireTreeNode<TreeNodeItem>) => {
    this.forceUpdate();
  };

  /** @internal */
  public override shouldComponentUpdate(nextProps: BreadcrumbDropdownProps) {
    return this.props.tree !== nextProps.tree ||
      this.props.node !== nextProps.node ||
      (nextProps.node && /* istanbul ignore next */ nextProps.node.isDirty()) ||
      this.props.onInputStart !== nextProps.onInputStart ||
      this.props.delimiter !== nextProps.delimiter ||
      this.props.width !== nextProps.width ||
      this.props.renderNode !== nextProps.renderNode;
  }

  public override render(): JSX.Element | null {
    const node = this.props.node;
    let nodes: BeInspireTreeNodes<TreeNodeItem> | undefined;
    if (node) {
      nodes = toNodes<TreeNodeItem>(node.getParents());
      nodes.reverse();
      nodes.push(node);
    }
    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
      <div
        className="components-breadcrumb-dropdown"
        data-testid="components-breadcrumb-dropdown-background"
        style={{ width: this.props.width }}
        onClick={this._focusInput}
        role="button" tabIndex={-1}
      >
        {!this.props.staticOnly && this.props.showUpDir ?
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <div data-testid="components-breadcrumb-up-dir"
            className={classnames(
              "components-breadcrumb-up-dir",
              "icon", "icon-sort-up",
              { root: this.props.node === undefined })
            } onClick={this._handleUpClick} role="button" tabIndex={-1} />
          : undefined
        }
        <div className="components-breadcrumb-crumb-list"
          data-testid="components-breadcrumb-crumb-list">
          <BreadcrumbDropdownNode
            key={-1}
            tree={this.props.tree}
            node={undefined}
            onNodeSelected={this.props.onNodeChange}
            staticOnly={this.props.staticOnly}
            parentsOnly={this.props.parentsOnly}
            last={!nodes || nodes.length === 0}
            renderNode={this.props.renderNode}
            expandedNode={this.props.expandedNode} />
          {nodes && nodes.map((n, i) => {
            return (
              <BreadcrumbDropdownNode
                key={i}
                tree={this.props.tree}
                node={n}
                onNodeSelected={this.props.onNodeChange}
                staticOnly={this.props.staticOnly}
                parentsOnly={this.props.parentsOnly}
                last={i === nodes!.length - 1}
                renderNode={this.props.renderNode}
                expandedNode={this.props.expandedNode} />
            );
          })}
        </div>
      </div>
    );
  }

  private _handleUpClick = () => {
    let parent: TreeNodeItem | undefined;
    if (this.props.node) {
      const p = (this.props.node.getParent()) as BeInspireTreeNode<TreeNodeItem>;
      if (p)
        parent = p.payload;
    }
    this.props.onNodeChange(parent);
  };

  private _focusInput = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget && this.props.onInputStart) // check if click is direct, or bubbled
      this.props.onInputStart();
  };
}

/** @internal */
interface BreadcrumbDropdownNodeProps {
  tree: BeInspireTree<TreeNodeItem>;
  node?: BeInspireTreeNode<TreeNodeItem>;
  onNodeSelected: (node: TreeNodeItem | undefined) => void;
  staticOnly?: boolean;
  parentsOnly?: boolean;
  last?: boolean;
  renderNode?: BreadcrumbNodeRenderer;
  expandedNode?: boolean;
}

/** @internal */
class BreadcrumbDropdownNode extends React.Component<BreadcrumbDropdownNodeProps> {
  constructor(props: BreadcrumbDropdownNodeProps) {
    super(props);
  }

  public override render(): React.ReactNode {
    const { node } = this.props;
    let nodeChildren: Array<BeInspireTreeNode<TreeNodeItem>> = this.props.tree.nodes();
    if (node)
      nodeChildren = toNodes<TreeNodeItem>(node.getChildren());
    const n = node && node.payload;
    let parent: TreeNodeItem | undefined;
    if (node) {
      const p = node.getParent() as BeInspireTreeNode<TreeNodeItem>;
      if (p)
        parent = p.payload;
    }
    const label = n && n.label ? n.label : PropertyRecord.fromString("");
    const icon = n && n.icon ? n.icon : "icon-browse";
    const renderNode = this.props.renderNode ? this.props.renderNode : this.renderNode;
    if (this.props.parentsOnly)
      nodeChildren = nodeChildren.filter((child) => child.hasOrWillHaveChildren());
    if (nodeChildren.length > 0) {
      if (this.props.staticOnly) {
        return <span data-testid="components-breadcrumb-static-button" className="components-breadcrumb-split-button static">
          {renderNode({ label, icon }, n, parent)}
          {!this.props.last ? <span className="static-arrow-icon icon icon-chevron-right" /> : undefined}
        </span>;
      }
      return (
        <SplitButton
          className="components-breadcrumb-split-button"
          onClick={(event) => {
            event.stopPropagation();
            this.props.onNodeSelected(n);
          }}
          label={renderNode({ label, icon }, n, parent)}
          initialExpanded={this.props.expandedNode}
        >
          {nodeChildren.map((child, d) => {
            return (
              <ContextMenuItem
                key={d}
                icon={child.payload!.icon}
                onSelect={(_event) => {
                  this.props.onNodeSelected(child.payload);
                }}>
                {PropertyValueRendererManager.defaultManager.render(child.payload!.label)}
              </ContextMenuItem>
            );
          })}
        </SplitButton>
      );
    } else {
      return (
        <span className={classnames("components-breadcrumb-end-node", { static: this.props.staticOnly })}>
          {renderNode({ label, icon }, n, parent)}
        </span>
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private renderNode = (props: BreadcrumbNodeProps, _node?: TreeNodeItem, _parent?: TreeNodeItem) => {
    return <BreadcrumbNode label={props.label} icon={props.icon} />;
  };
}

/** Properties for [[BreadcrumbNode]] component
 * @beta
 */
export interface BreadcrumbNodeProps {
  /** Icon class string */
  icon: string;
  /** Node label */
  label: PropertyRecord;
  /** @internal */
  onRender?: () => void;
}

/** Default BreadcrumbNode component
 * @beta
 */
export class BreadcrumbNode extends React.Component<BreadcrumbNodeProps> {
  constructor(props: BreadcrumbNodeProps) {
    super(props);
  }

  public override render(): React.ReactNode {
    const { icon, label } = this.props;
    return <span data-testid="components-breadcrumb-node"><span className={classnames("icon", icon)} />{PropertyValueRendererManager.defaultManager.render(label)}</span>;
  }

  public override componentDidMount() {
    // istanbul ignore next
    if (this.props.onRender)
      this.props.onRender();
  }

  public override componentDidUpdate() {
    // istanbul ignore next
    if (this.props.onRender)
      this.props.onRender();
  }
}
