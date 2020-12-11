/**
 * @see https://vercel.com/docs/platform/limits#serverless-function-payload-size-limit
 */
const DEFAULT_MAX_BYTES_LENGTH = 5242880; // 5 Megabytes

//#region typings

type BufferResponse = Buffer | ArrayBuffer | ArrayBufferLike;

type RequestResponse = {
	statusCode: number;
	headers?: Record<string, any>;
};

export type ContinueResponse = {
	buffer?: BufferResponse;
	response?: RequestResponse;
	additional?: any;
};

export interface IResolveSourceBufferResponse {
	buffer: BufferResponse;
	totalLength: number;
	additional?: any;
}

export type ContinueFunction = (response: ContinueResponse) => any;

export type Options = {
	resolveSourceBuffer: (
		start: number,
		end?: number
	) => Promise<IResolveSourceBufferResponse>;
	continue: ContinueFunction;
	maxLength?: number;
};

//#endregion
//#region public methods

const withPartialContent = (options: Options) => async (range: string) => {
	const explode = range.replace(/bytes=/, "").split("-");
	options.maxLength = options.maxLength || DEFAULT_MAX_BYTES_LENGTH;

	let start = parseInt(explode[0], 10);
	let end = explode[1] ? parseInt(explode[1], 10) : void 0;

	start = isNaN(start) === true ? 0 : Math.max(start, 0);
	end =
		end !== void 0 && (isNaN(end) === true || end > options.maxLength)
			? options.maxLength
			: end;

	const resolve = await options.resolveSourceBuffer(start, end).catch(() => {
		return null;
	});

	if (resolve === null) {
		return options.continue({
			response: {
				statusCode: 400,
			},
		});
	}

	const { buffer, totalLength, additional } = resolve;

	if (end === void 0) {
		end = totalLength - 1;
	}

	if (end <= 0 || end > totalLength) {
		return options.continue({
			response: {
				statusCode: 416,
				headers: {
					"Content-Range": `bytes */${totalLength}`,
				},
			},
		});
	}

	const continueResponse: ContinueResponse = {
		buffer,
		response: {
			statusCode: 206,
			headers: {
				"Content-Range": `bytes ${start}-${Math.min(
					end,
					totalLength - 1
				)}/${totalLength}`,
				"Content-Length": buffer.byteLength,
			},
		},
		additional,
	};

	return options.continue(continueResponse);
};

export default withPartialContent;

//#endregion
