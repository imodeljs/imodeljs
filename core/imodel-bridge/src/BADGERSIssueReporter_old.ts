/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbResult, Guid, GuidString } from "@bentley/bentleyjs-core";
import { ECDb } from "@bentley/imodeljs-backend";
import { BridgeIssueReporter } from "./BridgeIssueReporter"
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fips } from "crypto";

interface ContextInfo {
    activityId: string;
    contextId: string;
    iModelId: string;
    briefcaseId: number;
    operationType?: string;
    jobId?: string;
}

interface FileInfo {
    fileId?: string;
    filePath?: string;
}

/** BADGERS issue reporter. Can be provided to BridgeRunner in setIssueReporter
 * @beta
 */
export class BADGERSIssueReporter implements BridgeIssueReporter {
    private _reportDb;
    private _reportFile;
    private _reportSummaryFile; //ToDo create summary report
    private _stagingDir;
    private _contextInfo: ContextInfo;
    private _fileInfo: FileInfo;
    private _dbPath: string = "";
    // private _authHandler; //Callback to get token. Refer to serverArgs
    // private _signInMgr;
    // private _isValidContext;
    private _deleteBadgersDb;
    private _categoryCaluse;
    private _typeCaluse;
    private _levelCaluse;

    private TEMP_REPORT_FILE_RECORDS_TABLE = "BadgersReportFileRecords";
    private TEMP_REPORT_AUDIT_RECORDS_TABLE = "BadgersReportAuditRecords";
    private SRCFILE_TEMP_BRIDGE_ISSUES_TABLE = "BadgersSrcFileReports";
    private TEMP_IGNORED_ELEM_RECORD_TABLE = "BadgersReportIgnoredElementRecords";

    public constructor(contextId: any, iModelId: GuidString, activityId: string, fileId: string, operationType?: string, filePath?: any,
        stagingDir?: any, jobId?: string, deleteReportDB?: boolean) {

        const opType = operationType ? operationType : "NORMAL_UPDATE";
        this._contextInfo = { operationType: opType, activityId, jobId, contextId, iModelId, briefcaseId: 2 };
        this._fileInfo = { fileId, filePath };
        this._stagingDir = stagingDir ? stagingDir : os.tmpdir();
        this._deleteBadgersDb = deleteReportDB ? deleteReportDB : false;

        this._categoryCaluse = "'Business Properties'";
        this._typeCaluse = "'Model', 'ProjectExtents'";
        this._levelCaluse = "'Error', 'Warning'";

        this._reportFile = this.computeReportFileName(activityId, false);
        this._reportSummaryFile = this.computeReportFileName(activityId, true);

        this._reportDb = new ECDb();
        this.createBadgersDb();
        this.createDBSchema();
    }


    private computeReportFileName(activityId: string, isSummary: boolean) {
        let reportFileName = `${activityId}-${this._contextInfo.operationType}`
        if (isSummary) {
            reportFileName = reportFileName + "-summary-issues.json";
        } else {
            reportFileName = reportFileName + "-issues.json";
        }
        return reportFileName;
    }

    public recordIgnoredElements(repositoryLinkId: string, ignoredElementIdList: string) {
        this.handleFileRecord();
        this._reportDb.withPreparedSqliteStatement(`INSERT INTO ${this.TEMP_IGNORED_ELEM_RECORD_TABLE} (repositoryId, elementIds) VALUES(?,?)`, (stmt) => {
            stmt.bindValue(1, repositoryLinkId);
            stmt.bindValue(2, ignoredElementIdList);
            stmt.step();
        })
    }

    public reportIssue(ecInstanceId: string, sourceId: string, level: string, category: string, message: string, type: string) {
        this.handleFileRecord();
        if (this.issueExistsInDb(ecInstanceId, sourceId, level, category, message, type))
            return;
        const guid = Guid.createValue();
        const values = [this._fileInfo.fileId, ecInstanceId, sourceId, level, category, message, type, guid];
        this._reportDb.withPreparedSqliteStatement(`INSERT INTO ${this.TEMP_REPORT_AUDIT_RECORDS_TABLE} (fileId, ecInstanceId, elementSourceId, auditLevel, auditCategory, auditMessage, auditType, GUID) VALUES(?,?,?,?,?,?,?,?)`, (stmt) => {
            stmt.bindValues(values);
            stmt.step();
        });
    }

    public recordSourceFileInfo(srcId: string, name: string, uniqueName: string, itemType: string, dataSource: string, state: string, failureReason: string, exists: boolean, fileSize: number, foundByBridge: boolean, downloadUrl?: string,) {
        //If the id is not the same throw a warning
        const values = [this._contextInfo.activityId, this._contextInfo.contextId, this._contextInfo.jobId, this._contextInfo.iModelId, this._contextInfo.briefcaseId, srcId, this._fileInfo.filePath,
            "SourceFile", itemType, dataSource, name, exists, downloadUrl, state, failureReason, uniqueName, fileSize, foundByBridge]
        this._reportDb.withPreparedSqliteStatement(`INSERT INTO ${this.SRCFILE_TEMP_BRIDGE_ISSUES_TABLE}(activityId, contextId, jobId, imodelId, briefcaseId, fileId, filePath, dataType, itemType, dataSource, fileName, itemExists, downloadUrl, state, failureReason, uniqueName, fileSize, foundByBridge) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, (stmt) => {
            stmt.bindValues(values);
            stmt.step();
        })
    }

    public recordReferenceFileInfo(srcId: string, name: string, uniqueName: string, itemType: string, dataSource: string, downloadUrl: string, state: string, failureReason: string, exists: boolean, fileSize: number, foundByBridge: boolean) {
        const values = [this._contextInfo.activityId, this._contextInfo.contextId, this._contextInfo.jobId, this._contextInfo.iModelId, this._contextInfo.briefcaseId, srcId, this._fileInfo.filePath,
            "ReferenceFile", itemType, dataSource, name, exists, downloadUrl, state, failureReason, uniqueName, fileSize, foundByBridge]
        this._reportDb.withPreparedSqliteStatement(`INSERT INTO ${this.SRCFILE_TEMP_BRIDGE_ISSUES_TABLE}(activityId, contextId, jobId, imodelId, briefcaseId, fileId, filePath, dataType, itemType, dataSource, fileName, itemExists, downloadUrl, state, failureReason, uniqueName, fileSize, foundByBridge) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, (stmt) => {
            stmt.bindValues(values);
            stmt.step();
        })
    }

    public createJsonReport() {
        const timestamp = new Date().toISOString();
        const context = {
            "reportType": "detailReport",
            "operationType": this._contextInfo.operationType,
            "jobid": this._contextInfo.jobId,
            "contextid": this._contextInfo.contextId,
            "imodelid": this._contextInfo.iModelId,
            "activityid": this._contextInfo.activityId,
            "briefcaseid": this._contextInfo.briefcaseId,
            "timestamp": timestamp
        };

        const sourceFile: any = {};
        this._reportDb.withPreparedSqliteStatement(`SELECT dataType, itemType, dataSource, fileId, fileName, itemExists, downloadUrl, state, failureReason, uniqueName, fileSize FROM ${this.SRCFILE_TEMP_BRIDGE_ISSUES_TABLE} WHERE activityId=? AND foundByBridge=? AND dataType=?`,
            (stmt) => {
                stmt.bindValue(1, this._contextInfo.activityId);
                stmt.bindValue(2, true);
                stmt.bindValue(3, "SourceFile");
                while (stmt.step() === DbResult.BE_SQLITE_ROW) {
                    const row = stmt.getRow()
                    sourceFile["itemType"] = row.itemType;
                    sourceFile["dataSource"] = row.dataSource;
                    sourceFile["path"] = this._fileInfo.filePath;
                    sourceFile["fileId"] = row.fileId;
                    sourceFile["fileName"] = row.fileName;
                    sourceFile["fileExists"] = row.itemExists;
                }
            });


        const referenceFiles: any = [];
        this._reportDb.withPreparedSqliteStatement(`SELECT dataType, itemType, dataSource, fileId, fileName, itemExists, downloadUrl, state, failureReason, uniqueName, fileSize  FROM ${this.SRCFILE_TEMP_BRIDGE_ISSUES_TABLE} WHERE activityId =? AND dataType=?`, (stmt) => {
            stmt.bindValue(1, this._contextInfo.activityId);
            stmt.bindValue(2, "ReferenceFile");
            while (stmt.step() === DbResult.BE_SQLITE_ROW) {
                const row = stmt.getRow()
                referenceFiles.push({
                    "fileId": row.fileId,
                    "fileName": row.fileName,
                    "path": row.filePath,
                    "state": row.state,
                    "iModelFileId": row.uniqueName,
                    "fileExists": row.itemExists,
                    "bimFileExists": true //ToDo query iModel
                })
            }
        });
        sourceFile["Files"] = referenceFiles;

        const auditrecords: any[] = [];
        this._reportDb.withPreparedSqliteStatement(`SELECT fileId, ecInstanceId, elementSourceId, auditLevel, auditCategory, auditMessage, auditType, GUID FROM ${this.TEMP_REPORT_AUDIT_RECORDS_TABLE} WHERE fileId =? `, (stmt) => {
            stmt.bindValue(1, sourceFile.fileId);
            while (stmt.step() === DbResult.BE_SQLITE_ROW) {
                const row = stmt.getRow();
                auditrecords.push({
                    "elementinfo": {
                        "ecinstanceid": row.ecInstanceId,
                        "sourceid": row.elementSourceId
                    },
                    "auditinfo": {
                        "level": row.auditLevel,
                        "category": row.auditCategory,
                        "message": row.auditMessage,
                        "type": row.auditType
                    }
                })
            }
        })

        const ignoredelements: any[] = [];
        this._reportDb.withPreparedSqliteStatement(`SELECT repositoryId, elementIds FROM ${this.TEMP_IGNORED_ELEM_RECORD_TABLE}`, (stmt) => {
            while (stmt.step() === DbResult.BE_SQLITE_ROW) {
                const row = stmt.getRow();
                ignoredelements.push({
                    "ignoredelementinfo": {
                        "repositorylinkId": row.repositoryId,
                        "elementsids": row.elementIds
                    }
                })
            }
        });

        const fileRecord: any[] = [{
            "file": {
                "identifier": sourceFile.fileId,
                "path": sourceFile.path,
                "ignoredelements": ignoredelements,
            },
            "auditrecords": auditrecords
        }];

        const report = {
            "context": context,
            "sourceFilesInfo": sourceFile,
            "filerecords": fileRecord
        }
        const reportFilePath = path.join(this._stagingDir, this._reportFile);
        fs.writeFileSync(reportFilePath, JSON.stringify(report));
        return report;
    }

    private issueExistsInDb(ecInstanceId: string, sourceId: string, level: string, category: string, message: string, type: string) {
        let exists = false;
        const values = [this._fileInfo.fileId, ecInstanceId, sourceId, level, category, message, type];
        this._reportDb.withPreparedSqliteStatement(`SELECT * FROM ${this.TEMP_REPORT_AUDIT_RECORDS_TABLE} WHERE fileId =? and ecInstanceId =? and elementSourceId =? and auditLevel =? and auditCategory =? and auditMessage =? and auditType =? `, (stmt) => {
            stmt.bindValues(values);
            if (stmt.step() === DbResult.BE_SQLITE_ROW)
                exists = true;
        })
        return exists;
    }

    private handleFileRecord() {
        this._reportDb.withPreparedSqliteStatement(`SELECT fileId FROM ${this.TEMP_REPORT_FILE_RECORDS_TABLE} WHERE fileId =? and activityId =? `, (stmt) => {
            stmt.bindValue(1, this._fileInfo.fileId);
            stmt.bindValue(2, this._contextInfo.activityId);
            if (stmt.step() !== DbResult.BE_SQLITE_ROW) {
                this._reportDb.withSqliteStatement(`INSERT INTO ${this.TEMP_REPORT_FILE_RECORDS_TABLE}(activityId, fileId, filePath) VALUES(?,?,?)`, (myStmt) => {
                    const values = [this._contextInfo.activityId, this._fileInfo.fileId, this._fileInfo.filePath]
                    myStmt.bindValues(values);
                    myStmt.step();
                })
            }
        })
    }

    private createDBSchema() {
        this._reportDb.withSqliteStatement(`CREATE TABLE ${this.TEMP_REPORT_FILE_RECORDS_TABLE}(activityId STRING, fileId STRING NOT NULL UNIQUE, filePath STRING)`, (stmt) => { stmt.step(); });
        this._reportDb.withSqliteStatement(`CREATE INDEX ${this.TEMP_REPORT_FILE_RECORDS_TABLE}ActivityIdx ON ${this.TEMP_REPORT_FILE_RECORDS_TABLE}(activityId)`, (stmt) => { stmt.step(); });

        this._reportDb.withSqliteStatement(`CREATE TABLE ${this.TEMP_REPORT_AUDIT_RECORDS_TABLE}(fileId STRING NOT NULL, ecInstanceId STRING, elementSourceId STRING, auditLevel STRING,
            auditCategory STRING, auditMessage STRING, auditType STRING, GUID STRING)`, (stmt) => { stmt.step(); });

        this._reportDb.withSqliteStatement(`CREATE TABLE ${this.SRCFILE_TEMP_BRIDGE_ISSUES_TABLE}(activityId STRING, contextId STRING, jobId STRING, imodelId STRING, briefcaseId STRING,
                fileId STRING, filePath STRING, dataType STRING, itemType STRING, dataSource STRING, fileName STRING, itemExists BOOLEAN, downloadUrl STRING, state STRING, failureReason STRING, uniqueName STRING, fileSize INTEGER, foundByBridge BOOLEAN)`, (stmt) => { stmt.step(); });
        this._reportDb.withSqliteStatement(`CREATE INDEX ${this.SRCFILE_TEMP_BRIDGE_ISSUES_TABLE}ActivityIdx ON ${this.SRCFILE_TEMP_BRIDGE_ISSUES_TABLE}(activityId)`, (stmt) => { stmt.step(); });

        this._reportDb.withSqliteStatement(`CREATE TABLE ${this.TEMP_IGNORED_ELEM_RECORD_TABLE}(repositoryId STRING, elementIds STRING)`, (stmt) => { stmt.step(); });
        this._reportDb.withSqliteStatement(`CREATE INDEX ${this.TEMP_IGNORED_ELEM_RECORD_TABLE}repositoryIdx ON ${this.TEMP_IGNORED_ELEM_RECORD_TABLE}(repositoryId)`, (stmt) => { stmt.step(); });
    }

    private createBadgersDb() {
        const tempDbFileName = `${this._contextInfo.activityId} - ${this._contextInfo.operationType} - badgers.db`
        this._dbPath = path.join(this._stagingDir, tempDbFileName);
        if (fs.existsSync(this._dbPath)) {
            fs.unlinkSync(this._dbPath);
        }
        if (!fs.existsSync(this._dbPath)) {
            this._reportDb.createDb(this._dbPath);
        }
    }

    private deleteBadgersDb() {
        if (this._deleteBadgersDb && fs.existsSync(this._dbPath)) {
            fs.unlinkSync(this._dbPath);
        }
    }

    public publishReport() {
        this.createJsonReport();
        //Upload report file
        this.deleteBadgersDb();
    }

}