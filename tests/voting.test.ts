 
import { describe, it, expect, beforeEach } from "vitest";
import { noneCV, someCV, stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_POLL_ID = 101;
const ERR_INVALID_OPTION_ID = 102;
const ERR_POLL_NOT_ACTIVE = 103;
const ERR_VOTING_PERIOD_ENDED = 104;
const ERR_ALREADY_VOTED = 105;
const ERR_POLL_NOT_FOUND = 106;
const ERR_OPTION_NOT_FOUND = 107;
const ERR_INVALID_TIMESTAMP = 108;
const ERR_INVALID_VOTER = 109;
const ERR_VOTE_NOT_ALLOWED = 110;
const ERR_INSUFFICIENT_STAKE = 111;
const ERR_POLL_CLOSED = 112;
const ERR_INVALID_VOTE_WEIGHT = 113;
const ERR_MAX_VOTES_EXCEEDED = 114;
const ERR_INVALID_POLL_TYPE = 115;
const ERR_INVALID_STAKE_AMOUNT = 116;
const ERR_STAKE_NOT_REQUIRED = 117;
const ERR_VOTER_BANNED = 118;
const ERR_INVALID_CONTRACT_CALL = 119;
const ERR_EMIT_EVENT_FAILED = 120;

interface Vote {
	optionId: number;
	voteWeight: number;
	timestamp: number;
}

interface Poll {
	isActive: boolean;
	endTime: number;
}

interface Option {
	voteCount: number;
}

interface VoteEvent {
	pollId: number;
	voter: string;
	optionId: number;
	timestamp: number;
}

interface Result<T> {
	ok: boolean;
	value: T;
}

class VotingContractMock {
	state: {
		voteCounter: number;
		maxVotesPerPoll: number;
		minStakeRequired: number;
		authorityPrincipal: string | null;
		votes: Map<string, Vote>;
		voterStakes: Map<string, number>;
		bannedVoters: Set<string>;
		pollTypes: Map<number, string>;
		voteEvents: Map<number, VoteEvent>;
		polls: Map<number, Poll>;
		options: Map<string, Option>;
	} = {
		voteCounter: 0,
		maxVotesPerPoll: 10000,
		minStakeRequired: 0,
		authorityPrincipal: null,
		votes: new Map(),
		voterStakes: new Map(),
		bannedVoters: new Set(),
		pollTypes: new Map(),
		voteEvents: new Map(),
		polls: new Map(),
		options: new Map(),
	};
	blockHeight: number = 0;
	caller: string = "ST1TEST";
	stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

	constructor() {
		this.reset();
	}

	reset() {
		this.state = {
			voteCounter: 0,
			maxVotesPerPoll: 10000,
			minStakeRequired: 0,
			authorityPrincipal: null,
			votes: new Map(),
			voterStakes: new Map(),
			bannedVoters: new Set(),
			pollTypes: new Map(),
			voteEvents: new Map(),
			polls: new Map(),
			options: new Map(),
		};
		this.blockHeight = 0;
		this.caller = "ST1TEST";
		this.stxTransfers = [];
	}

	private getVoteKey(pollId: number, voter: string): string {
		return `${pollId}-${voter}`;
	}

	private getStakeKey(pollId: number, voter: string): string {
		return `${pollId}-${voter}-stake`;
	}

	private getOptionKey(pollId: number, optionId: number): string {
		return `${pollId}-${optionId}-option`;
	}

	setAuthorityPrincipal(newPrincipal: string): Result<boolean> {
		if (newPrincipal === "SP000000000000000000002Q6VF78") {
			return { ok: false, value: ERR_INVALID_VOTER };
		}
		if (this.state.authorityPrincipal !== null) {
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		}
		this.state.authorityPrincipal = newPrincipal;
		return { ok: true, value: true };
	}

	setMaxVotesPerPoll(newMax: number): Result<boolean> {
		if (newMax <= 0) return { ok: false, value: ERR_INVALID_VOTE_WEIGHT };
		if (!this.state.authorityPrincipal)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		this.state.maxVotesPerPoll = newMax;
		return { ok: true, value: true };
	}

	setMinStakeRequired(newMin: number): Result<boolean> {
		if (newMin < 0) return { ok: false, value: ERR_INVALID_STAKE_AMOUNT };
		if (!this.state.authorityPrincipal)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		this.state.minStakeRequired = newMin;
		return { ok: true, value: true };
	}

	banVoter(voter: string): Result<boolean> {
		if (this.caller !== this.state.authorityPrincipal)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		if (voter === "SP000000000000000000002Q6VF78")
			return { ok: false, value: ERR_INVALID_VOTER };
		this.state.bannedVoters.add(voter);
		return { ok: true, value: true };
	}

	unbanVoter(voter: string): Result<boolean> {
		if (this.caller !== this.state.authorityPrincipal)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		this.state.bannedVoters.delete(voter);
		return { ok: true, value: true };
	}

	setPollType(pollId: number, pollType: string): Result<boolean> {
		if (this.caller !== this.state.authorityPrincipal)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		if (pollId <= 0) return { ok: false, value: ERR_INVALID_POLL_ID };
		this.state.pollTypes.set(pollId, pollType);
		return { ok: true, value: true };
	}

	stakeForVote(pollId: number, amount: number): Result<boolean> {
		if (pollId <= 0) return { ok: false, value: ERR_INVALID_POLL_ID };
		if (amount < this.state.minStakeRequired)
			return { ok: false, value: ERR_INVALID_STAKE_AMOUNT };
		const key = this.getStakeKey(pollId, this.caller);
		const current = this.state.voterStakes.get(key) || 0;
		this.state.voterStakes.set(key, current + amount);
		this.stxTransfers.push({ amount, from: this.caller, to: "contract" });
		return { ok: true, value: true };
	}

	castVote(
		pollId: number,
		optionId: number,
		voteWeight: number
	): Result<boolean> {
		const poll = this.state.polls.get(pollId);
		if (!poll) return { ok: false, value: ERR_POLL_NOT_FOUND };
		const optionKey = this.getOptionKey(pollId, optionId);
		const option = this.state.options.get(optionKey);
		if (!option) return { ok: false, value: ERR_OPTION_NOT_FOUND };
		if (pollId <= 0) return { ok: false, value: ERR_INVALID_POLL_ID };
		if (optionId <= 0) return { ok: false, value: ERR_INVALID_OPTION_ID };
		if (voteWeight <= 0 || voteWeight > 10)
			return { ok: false, value: ERR_INVALID_VOTE_WEIGHT };
		if (!poll.isActive) return { ok: false, value: ERR_POLL_NOT_ACTIVE };
		if (this.blockHeight > poll.endTime)
			return { ok: false, value: ERR_VOTING_PERIOD_ENDED };
		const voteKey = this.getVoteKey(pollId, this.caller);
		if (this.state.votes.has(voteKey))
			return { ok: false, value: ERR_ALREADY_VOTED };
		if (this.state.bannedVoters.has(this.caller))
			return { ok: false, value: ERR_VOTER_BANNED };
		const stakeKey = this.getStakeKey(pollId, this.caller);
		const stake = this.state.voterStakes.get(stakeKey) || 0;
		if (stake < this.state.minStakeRequired)
			return { ok: false, value: ERR_INSUFFICIENT_STAKE };
		if (this.state.voteCounter >= this.state.maxVotesPerPoll)
			return { ok: false, value: ERR_MAX_VOTES_EXCEEDED };
		this.state.votes.set(voteKey, {
			optionId,
			voteWeight,
			timestamp: this.blockHeight,
		});
		this.state.options.set(optionKey, {
			voteCount: option.voteCount + voteWeight,
		});
		const eventId = this.state.voteCounter;
		this.state.voteEvents.set(eventId, {
			pollId,
			voter: this.caller,
			optionId,
			timestamp: this.blockHeight,
		});
		this.state.voteCounter++;
		return { ok: true, value: true };
	}

	withdrawStake(pollId: number, amount: number): Result<boolean> {
		const poll = this.state.polls.get(pollId);
		if (!poll) return { ok: false, value: ERR_POLL_NOT_FOUND };
		if (pollId <= 0) return { ok: false, value: ERR_INVALID_POLL_ID };
		if (poll.isActive) return { ok: false, value: ERR_POLL_NOT_ACTIVE };
		const stakeKey = this.getStakeKey(pollId, this.caller);
		const current = this.state.voterStakes.get(stakeKey) || 0;
		if (current < amount) return { ok: false, value: ERR_INSUFFICIENT_STAKE };
		this.state.voterStakes.set(stakeKey, current - amount);
		this.stxTransfers.push({ amount, from: "contract", to: this.caller });
		return { ok: true, value: true };
	}

	getVoteCount(): Result<number> {
		return { ok: true, value: this.state.voteCounter };
	}

	// Mock setup methods for tests
	setPoll(pollId: number, isActive: boolean, endTime: number) {
		this.state.polls.set(pollId, { isActive, endTime });
	}

	setOption(pollId: number, optionId: number, voteCount: number) {
		const key = this.getOptionKey(pollId, optionId);
		this.state.options.set(key, { voteCount });
	}
}

describe("VotingContract", () => {
	let contract: VotingContractMock;

	beforeEach(() => {
		contract = new VotingContractMock();
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
		expect(result.value).toBe(ERR_INVALID_VOTER);
	});

	it("sets min stake required successfully", () => {
		contract.setAuthorityPrincipal("ST2TEST");
		const result = contract.setMinStakeRequired(100);
		expect(result.ok).toBe(true);
		expect(contract.state.minStakeRequired).toBe(100);
	});

	it("bans voter successfully", () => {
		contract.setAuthorityPrincipal("ST1TEST");
		const result = contract.banVoter("ST3VOTER");
		expect(result.ok).toBe(true);
		expect(contract.state.bannedVoters.has("ST3VOTER")).toBe(true);
	});

	it("unbans voter successfully", () => {
		contract.setAuthorityPrincipal("ST1TEST");
		contract.banVoter("ST3VOTER");
		const result = contract.unbanVoter("ST3VOTER");
		expect(result.ok).toBe(true);
		expect(contract.state.bannedVoters.has("ST3VOTER")).toBe(false);
	});

	it("casts vote successfully", () => {
		contract.setAuthorityPrincipal("ST2TEST");
		contract.setMinStakeRequired(0);
		contract.setPoll(1, true, 100);
		contract.setOption(1, 1, 0);
		contract.blockHeight = 50;
		const result = contract.castVote(1, 1, 1);
		expect(result.ok).toBe(true);
		const vote = contract.state.votes.get("1-ST1TEST");
		expect(vote?.optionId).toBe(1);
		expect(vote?.voteWeight).toBe(1);
		expect(vote?.timestamp).toBe(50);
		const option = contract.state.options.get("1-1-option");
		expect(option?.voteCount).toBe(1);
		const event = contract.state.voteEvents.get(0);
		expect(event?.pollId).toBe(1);
		expect(event?.voter).toBe("ST1TEST");
		expect(event?.optionId).toBe(1);
		expect(event?.timestamp).toBe(50);
		expect(contract.state.voteCounter).toBe(1);
	});

	it("rejects vote if already voted", () => {
		contract.setPoll(1, true, 100);
		contract.setOption(1, 1, 0);
		contract.castVote(1, 1, 1);
		const result = contract.castVote(1, 1, 1);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_ALREADY_VOTED);
	});

	it("rejects withdraw if poll active", () => {
		contract.stakeForVote(1, 200);
		contract.setPoll(1, true, 100);
		const result = contract.withdrawStake(1, 100);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_POLL_NOT_ACTIVE);
	});

	it("gets vote count successfully", () => {
		const result = contract.getVoteCount();
		expect(result.ok).toBe(true);
		expect(result.value).toBe(0);
	});

	it("parses poll type with Clarity", () => {
		const cv = stringAsciiCV("standard");
		expect(cv.value).toBe("standard");
	});

	it("parses uint with Clarity", () => {
		const cv = uintCV(10);
		expect(cv.value).toEqual(BigInt(10));
	});
});