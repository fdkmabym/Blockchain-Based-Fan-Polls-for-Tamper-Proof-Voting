 
import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_POLL_ID = 101;
const ERR_INVALID_TITLE = 102;
const ERR_INVALID_DESCRIPTION = 103;
const ERR_INVALID_DURATION = 104;
const ERR_POLL_ALREADY_EXISTS = 105;
const ERR_POLL_NOT_FOUND = 106;
const ERR_INVALID_TIMESTAMP = 107;
const ERR_INVALID_CREATOR = 108;
const ERR_POLL_NOT_ACTIVE = 109;
const ERR_INVALID_STAKE_REQUIREMENT = 110;
const ERR_MAX_POLLS_EXCEEDED = 111;
const ERR_INVALID_POLL_TYPE = 112;
const ERR_INVALID_AUTHORITY = 113;
const ERR_INVALID_UPDATE_PARAM = 114;
const ERR_POLL_UPDATE_NOT_ALLOWED = 115;
const ERR_EMIT_EVENT_FAILED = 116;

interface Poll {
	title: string;
	description: string;
	creator: string;
	startTime: number;
	endTime: number;
	isActive: boolean;
	stakeRequired: number;
	pollType: string;
}

interface PollUpdate {
	updateTitle: string;
	updateDescription: string;
	updateTimestamp: number;
	updater: string;
}

interface PollEvent {
	pollId: number;
	eventType: string;
	timestamp: number;
}

interface Result<T> {
	ok: boolean;
	value: T;
}

class PollManagerMock {
	state: {
		pollCounter: number;
		maxPolls: number;
		authorityPrincipal: string | null;
		polls: Map<number, Poll>;
		pollUpdates: Map<number, PollUpdate>;
		pollEvents: Map<number, PollEvent>;
	} = {
		pollCounter: 0,
		maxPolls: 1000,
		authorityPrincipal: null,
		polls: new Map(),
		pollUpdates: new Map(),
		pollEvents: new Map(),
	};
	blockHeight: number = 0;
	caller: string = "ST1TEST";
	events: Array<{
		event: string;
		pollId: number;
		creator?: string;
		updater?: string;
		closer?: string;
	}> = [];

	constructor() {
		this.reset();
	}

	reset() {
		this.state = {
			pollCounter: 0,
			maxPolls: 1000,
			authorityPrincipal: null,
			polls: new Map(),
			pollUpdates: new Map(),
			pollEvents: new Map(),
		};
		this.blockHeight = 0;
		this.caller = "ST1TEST";
		this.events = [];
	}

	setAuthorityPrincipal(newPrincipal: string): Result<boolean> {
		if (newPrincipal === "SP000000000000000000002Q6VF78")
			return { ok: false, value: ERR_INVALID_CREATOR };
		if (this.state.authorityPrincipal !== null)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		this.state.authorityPrincipal = newPrincipal;
		return { ok: true, value: true };
	}

	setMaxPolls(newMax: number): Result<boolean> {
		if (newMax <= 0) return { ok: false, value: ERR_MAX_POLLS_EXCEEDED };
		if (!this.state.authorityPrincipal)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		this.state.maxPolls = newMax;
		return { ok: true, value: true };
	}

	createPoll(
		title: string,
		description: string,
		duration: number,
		stakeRequired: number,
		pollType: string
	): Result<number> {
		if (this.state.pollCounter >= this.state.maxPolls)
			return { ok: false, value: ERR_MAX_POLLS_EXCEEDED };
		if (title.length === 0) return { ok: false, value: ERR_INVALID_TITLE };
		if (description.length === 0)
			return { ok: false, value: ERR_INVALID_DESCRIPTION };
		if (duration <= 0) return { ok: false, value: ERR_INVALID_DURATION };
		if (stakeRequired < 0)
			return { ok: false, value: ERR_INVALID_STAKE_REQUIREMENT };
		if (!["standard", "premium", "community"].includes(pollType))
			return { ok: false, value: ERR_INVALID_POLL_TYPE };
		if (this.caller === "SP000000000000000000002Q6VF78")
			return { ok: false, value: ERR_INVALID_CREATOR };
		const pollId = this.state.pollCounter;
		this.state.polls.set(pollId, {
			title,
			description,
			creator: this.caller,
			startTime: this.blockHeight,
			endTime: this.blockHeight + duration,
			isActive: true,
			stakeRequired,
			pollType,
		});
		this.state.pollEvents.set(pollId, {
			pollId,
			eventType: "created",
			timestamp: this.blockHeight,
		});
		this.events.push({ event: "poll-created", pollId, creator: this.caller });
		this.state.pollCounter++;
		return { ok: true, value: pollId };
	}

	updatePoll(
		pollId: number,
		newTitle: string,
		newDescription: string
	): Result<boolean> {
		const poll = this.state.polls.get(pollId);
		if (!poll) return { ok: false, value: ERR_POLL_NOT_FOUND };
		if (poll.creator !== this.caller)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		if (!poll.isActive) return { ok: false, value: ERR_POLL_NOT_ACTIVE };
		if (newTitle.length === 0) return { ok: false, value: ERR_INVALID_TITLE };
		if (newDescription.length === 0)
			return { ok: false, value: ERR_INVALID_DESCRIPTION };
		this.state.polls.set(pollId, {
			...poll,
			title: newTitle,
			description: newDescription,
		});
		this.state.pollUpdates.set(pollId, {
			updateTitle: newTitle,
			updateDescription: newDescription,
			updateTimestamp: this.blockHeight,
			updater: this.caller,
		});
		this.state.pollEvents.set(this.state.pollCounter, {
			pollId,
			eventType: "updated",
			timestamp: this.blockHeight,
		});
		this.events.push({ event: "poll-updated", pollId, updater: this.caller });
		return { ok: true, value: true };
	}

	closePoll(pollId: number): Result<boolean> {
		const poll = this.state.polls.get(pollId);
		if (!poll) return { ok: false, value: ERR_POLL_NOT_FOUND };
		if (poll.creator !== this.caller)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		if (!poll.isActive) return { ok: false, value: ERR_POLL_NOT_ACTIVE };
		this.state.polls.set(pollId, { ...poll, isActive: false });
		this.state.pollEvents.set(this.state.pollCounter, {
			pollId,
			eventType: "closed",
			timestamp: this.blockHeight,
		});
		this.events.push({ event: "poll-closed", pollId, closer: this.caller });
		return { ok: true, value: true };
	}

	getPoll(pollId: number): Poll | null {
		return this.state.polls.get(pollId) || null;
	}

	getPollCount(): Result<number> {
		return { ok: true, value: this.state.pollCounter };
	}
}

describe("PollManager", () => {
	let contract: PollManagerMock;

	beforeEach(() => {
		contract = new PollManagerMock();
		contract.reset();
	});

	it("sets authority principal successfully", () => {
		const result = contract.setAuthorityPrincipal("ST2TEST");
		expect(result.ok).toBe(true);
		expect(contract.state.authorityPrincipal).toBe("ST2TEST");
	});

	it("rejects invalid authority principal", () => {
		const result = contract.setAuthorityPrincipal(
			"SP000000000000000000002Q6VF78"
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_CREATOR);
	});

	it("sets max polls successfully", () => {
		contract.setAuthorityPrincipal("ST2TEST");
		const result = contract.setMaxPolls(500);
		expect(result.ok).toBe(true);
		expect(contract.state.maxPolls).toBe(500);
	});

	it("creates poll successfully", () => {
		const result = contract.createPoll(
			"Best Artist",
			"Vote for your favorite artist",
			100,
			50,
			"standard"
		);
		expect(result.ok).toBe(true);
		expect(result.value).toBe(0);
		const poll = contract.getPoll(0);
		expect(poll?.title).toBe("Best Artist");
		expect(poll?.description).toBe("Vote for your favorite artist");
		expect(poll?.creator).toBe("ST1TEST");
		expect(poll?.isActive).toBe(true);
		expect(poll?.stakeRequired).toBe(50);
		expect(poll?.pollType).toBe("standard");
		expect(contract.events).toEqual([
			{ event: "poll-created", pollId: 0, creator: "ST1TEST" },
		]);
	});

	it("rejects poll creation with invalid title", () => {
		const result = contract.createPoll("", "Description", 100, 50, "standard");
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_TITLE);
	});

	it("rejects poll creation with invalid duration", () => {
		const result = contract.createPoll(
			"Title",
			"Description",
			0,
			50,
			"standard"
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_DURATION);
	});

	it("rejects poll creation with invalid poll type", () => {
		const result = contract.createPoll(
			"Title",
			"Description",
			100,
			50,
			"invalid"
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_POLL_TYPE);
	});

	it("updates poll successfully", () => {
		contract.createPoll("Old Title", "Old Description", 100, 50, "standard");
		const result = contract.updatePoll(0, "New Title", "New Description");
		expect(result.ok).toBe(true);
		const poll = contract.getPoll(0);
		expect(poll?.title).toBe("New Title");
		expect(poll?.description).toBe("New Description");
		const update = contract.state.pollUpdates.get(0);
		expect(update?.updateTitle).toBe("New Title");
		expect(update?.updateDescription).toBe("New Description");
		expect(update?.updater).toBe("ST1TEST");
		expect(contract.events).toContainEqual({
			event: "poll-updated",
			pollId: 0,
			updater: "ST1TEST",
		});
	});

	it("rejects update for non-existent poll", () => {
		const result = contract.updatePoll(99, "New Title", "New Description");
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_POLL_NOT_FOUND);
	});

	it("rejects update by non-creator", () => {
		contract.createPoll("Title", "Description", 100, 50, "standard");
		contract.caller = "ST2FAKE";
		const result = contract.updatePoll(0, "New Title", "New Description");
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_NOT_AUTHORIZED);
	});

	it("closes poll successfully", () => {
		contract.createPoll("Title", "Description", 100, 50, "standard");
		const result = contract.closePoll(0);
		expect(result.ok).toBe(true);
		const poll = contract.getPoll(0);
		expect(poll?.isActive).toBe(false);
		expect(contract.events).toContainEqual({
			event: "poll-closed",
			pollId: 0,
			closer: "ST1TEST",
		});
	});

	it("rejects close for non-existent poll", () => {
		const result = contract.closePoll(99);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_POLL_NOT_FOUND);
	});

	it("rejects close by non-creator", () => {
		contract.createPoll("Title", "Description", 100, 50, "standard");
		contract.caller = "ST2FAKE";
		const result = contract.closePoll(0);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_NOT_AUTHORIZED);
	});

	it("gets poll count successfully", () => {
		contract.createPoll("Title1", "Description1", 100, 50, "standard");
		contract.createPoll("Title2", "Description2", 200, 100, "premium");
		const result = contract.getPollCount();
		expect(result.ok).toBe(true);
		expect(result.value).toBe(2);
	});

	it("parses poll parameters with Clarity types", () => {
		const title = stringAsciiCV("Best Artist");
		const duration = uintCV(100);
		expect(title.value).toBe("Best Artist");
		expect(duration.value).toEqual(BigInt(100));
	});
});