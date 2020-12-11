//#region typings

type Extra = {
	statusCode: number;
	headers?: Record<string, any>;
};

export interface IPartialRequest {
	[key: string]: any;
}

export interface IPartialResponse {
	[key: string]: any;
}

export type Additional = Record<string, any> & {
	response?: Extra;
	error?: Extra;
} & { buffer?: ArrayBuffer | ArrayBufferLike };

export type ContinueFunction = (additional: Additional) => any;

export type PartialContentOptions = {
	maxLength?: number;
	resolveSourceBuffer: (
		start: number,
		end?: number
	) => Promise<{
		buffer: ArrayBuffer | ArrayBufferLike;
		totalLength: number;
		additional?: Additional;
	}>;
	continue: ContinueFunction;
};

//#endregion
//#region definitions

// @see https://vercel.com/docs/platform/limits#serverless-function-payload-size-limit
const DEFAULT_MAX_BYTES_LENGTH = 5242880; // 5 Megabytes

//#endregion
//#region public methods

const withPartialContent = (options: PartialContentOptions) => async (
	req: IPartialRequest,
	_: IPartialResponse
) => {
	let additional: Additional = {};

	if (typeof options.continue !== "function") {
		throw new Error('Missing "continue" function');
	} else if (typeof options.resolveSourceBuffer !== "function") {
		throw new Error('Missing "resolveSourceBuffer" function');
	}

	const continueFn = options.continue;
	const maxLength = Number(options.maxLength || DEFAULT_MAX_BYTES_LENGTH);
	const rangeHeader = String(req.headers["range"] || "").trim() || null;

	if (isNaN(maxLength) === true || rangeHeader === null) {
		additional.error = { statusCode: 400 };
		return continueFn(additional);
	}

	const [rangeStart, rangeEnd] = rangeHeader.replace(/bytes=/, "").split("-");

	const start = Math.min(Math.max(Number(rangeStart || 0), 0), maxLength - 1);
	const end =
		rangeEnd === void 0 ? "" : Math.min(Number(rangeEnd), maxLength);

	if (isNaN(start) === true || (!!end && isNaN(end) === true)) {
		additional.error = { statusCode: 400 };
		return continueFn(additional);
	}

	if (!!end && end < start) {
		additional.error = { statusCode: 400 };
		return continueFn(additional);
	}

	const {
		buffer,
		totalLength,
		additional: resolvedAdditional = {},
	} = await options.resolveSourceBuffer(start, end || void 0);

	additional = {
		...additional,
		resolvedAdditional,
	};

	if (buffer === null) {
		additional.error = { statusCode: 400 };
		return continueFn(additional);
	}

	if (!!end && end > totalLength) {
		additional.error = {
			statusCode: 416,
			headers: { "Content-Range": `bytes */${totalLength}` },
		};

		return continueFn(additional);
	}

	additional.response = {
		statusCode: 206,
		headers: {
			"Content-Range": `bytes ${start}-${
				(end || totalLength) - 1
			}/${totalLength}`,
			"Content-Length": buffer.byteLength,
		},
	};

	additional.buffer = buffer;
	return continueFn(additional);
};

export default withPartialContent;

//#endregion
