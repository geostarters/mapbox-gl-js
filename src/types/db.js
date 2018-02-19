// @flow

export type DbObject = {
    executeSql(query: string,
        params: Array<number>,
        successCb: (res: Object) => void,
        failCb: (error: Error) => void
    ) : void;
};
