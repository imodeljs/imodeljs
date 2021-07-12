/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ECSchemaRpcInterface } from "@bentley/ecschema-rpcinterface-common";
import { IModelRpcProps, RpcManager } from "@bentley/imodeljs-common";
import * as backend from "@bentley/imodeljs-backend";
import { SchemaKeyProps, SchemaProps } from "@bentley/ecschema-metadata";
import { ClientRequestContext } from "@bentley/bentleyjs-core";

/**
 * Defines the interface how the rows of the iModel query look like.
 */
interface SchemaNameRow {
  schemaName: string;
  read: string;
  write: string;
  minor: string;
}

/**
 * Implementation of the SchemaRpcInterface.
 * @internal
 */
export class ECSchemaRpcImpl extends ECSchemaRpcInterface {
  /**
   * Registers the RPC interface with its corresponding implementation class.
   */
  public static register() {
    RpcManager.registerImpl(ECSchemaRpcInterface, ECSchemaRpcImpl);
  }

  /**
   * Gets an iModelDb instance. It is important that the database has been opened before
   * otherwise it can't be found.
   * @param tokenProps        The iModelToken props that hold the information which iModel is used.
   * @returns                 Instance of IModelDb.
   */
  private async getIModelDatabase(tokenProps: IModelRpcProps): Promise<backend.IModelDb> {
    return new Promise<backend.IModelDb>((resolve) => {
      resolve(backend.IModelDb.findByKey(tokenProps.key));
    });
  }

  /**
   * Returns an array of SchemaKeyProps that exists in the current iModel context. The client can call
   * SchemaKey.fromJson() to parse the props to a SchemaKey.
   * @param tokenProps        The iModelToken props that hold the information which iModel is used.
   * @returns                 An array of SchemaKeyProps.
   */
  public override async getSchemaKeys(tokenProps: IModelRpcProps): Promise<SchemaKeyProps[]> {
    ClientRequestContext.current.enter();

    const schemaKeyProps: SchemaKeyProps[] = [];
    const iModelDb = await this.getIModelDatabase(tokenProps);

    // Iterate over the rows returned from AsyncIterableIterator. The custom Query overload returns
    // a typed row instance instead of any.
    const schemaNameQuery = `SELECT Name as schemaName, VersionMajor as read, VersionWrite as write, VersionMinor as minor FROM main.meta.ECSchemaDef`;
    for await (const schemaDefinitionRow of iModelDb.query(schemaNameQuery) as AsyncIterableIterator<SchemaNameRow>) {
      const schemaFullName = schemaDefinitionRow.schemaName;
      const read = Number(schemaDefinitionRow.read);
      const write = Number(schemaDefinitionRow.write);
      const minor = Number(schemaDefinitionRow.minor);
      schemaKeyProps.push({ name: schemaFullName, read, write, minor });
    }
    return schemaKeyProps;
  }

  /**
   * Gets the schema JSON for the current iModel context and returns the schema as a SchemaProps which
   * the client can call Schema.fromJson() to return a Schema.
   * @param tokenProps        The iModelToken props that hold the information which iModel is used.
   * @param schemaName        The name of the schema that shall be returned.
   * @returns                 The SchemaProps.
   */
  public override async getSchemaJSON(tokenProps: IModelRpcProps, schemaName: string): Promise<SchemaProps> {
    ClientRequestContext.current.enter();

    if (schemaName === undefined || schemaName.length < 1) {
      throw new Error(`Schema name must not be undefined or empty.`);
    }

    const iModelDb = await this.getIModelDatabase(tokenProps);
    const schemaResult = iModelDb.nativeDb.getSchema(schemaName);

    if (schemaResult.error !== undefined) {
      throw new Error(schemaResult.error.message);
    }

    if (schemaResult.result === undefined) {
      throw new Error("Schema does not exists");
    }

    return JSON.parse(schemaResult.result);
  }
}
