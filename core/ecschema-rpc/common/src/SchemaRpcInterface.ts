/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelRpcProps, RpcInterface, RpcManager } from "@bentley/imodeljs-common";
import { SchemaProps } from "@bentley/ecschema-metadata";

/***
 * Defines an RPC interface to get schema information from a given iModel context.
 * Method @see getSchemaNames will return the names of schemas that live in this iModel.
 * The actual schemas can be downloaded using @see getSchemaJSON to get the schema as JSON props
 * or @see getSchemaXml to get the schemas as XML document.
 * @Internal
 */
export abstract class SchemaRpcInterface extends RpcInterface {
  /** The version of the gateway. */
  public static version = "1.0.0";

  public static readonly interfaceName = "SchemaRpcInterface";
  public static interfaceVersion = SchemaRpcInterface.version;

  /**
   * Returns the IModelGatewayProxy instance for the frontend.
   * @returns                 A client proxy to communicate with the RPC Interface.
   */
  public static getClient(): SchemaRpcInterface {
    return RpcManager.getClientForInterface(SchemaRpcInterface);
  }

  /**
   * Returns an array of schema names that exists in the current iModel context.
   * @param tokenProps        The iModelToken props that hold the information which iModel is used.
   * @returns                 An array of schema names.
   */
  public async getSchemaNames(_tokenProps: IModelRpcProps): Promise<string[]> {
    return this.forward.apply(this, [arguments]) as Promise<string[]>;
  }

  /**
   * Gets the schema JSON for the current iModel context and returns the schema as props.
   * @param tokenProps        The iModelToken props that hold the information which iModel is used.
   * @param schemaName        The name of the schema that shall be returned.
   */
  public async getSchemaJSON(_tokenProps: IModelRpcProps, _schemaName: string): Promise<SchemaProps> {
    return this.forward.apply(this, [arguments]) as Promise<SchemaProps>;
  }

  /**
   * Gets the schema XML document for the current iModel context.
   * @param tokenProps        The iModelToken props that hold the information which iModel is used.
   * @param schemaName        The name of the schema that shall be returned.
   */
  /*
  public async getSchemaXml(_tokenProps: IModelTokenProps, _schemaName: string): Promise<string> {
    return this.forward.apply(this, [arguments]) as Promise<string>;
  }
  */

  /**
   * Gets the ECSQL column header values for the ECSQL query.
   * @param IModelToken       The iModelToken holds information which iModel is used.
   * @param ecsql             The ecsql to retrieve column headers from.
   * @returns                 An array with only ECSQL header values.
   */
  public async getQueryColumnHeaders(_tokenProps: IModelRpcProps, _ecsql: string): Promise<any[]> {
    return this.forward(arguments);
  }
}
