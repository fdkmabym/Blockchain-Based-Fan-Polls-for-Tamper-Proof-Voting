(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-POLL-ID u101)
(define-constant ERR-INVALID-OPTION-ID u102)
(define-constant ERR-POLL-NOT-ACTIVE u103)
(define-constant ERR-VOTING_PERIOD_ENDED u104)
(define-constant ERR-ALREADY-VOTED u105)
(define-constant ERR-POLL-NOT-FOUND u106)
(define-constant ERR-OPTION-NOT-FOUND u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-INVALID-VOTER u109)
(define-constant ERR-VOTE-NOT-ALLOWED u110)
(define-constant ERR-INSUFFICIENT-STAKE u111)
(define-constant ERR-POLL-CLOSED u112)
(define-constant ERR-INVALID-VOTE-WEIGHT u113)
(define-constant ERR-MAX-VOTES_EXCEEDED u114)
(define-constant ERR-INVALID-POLL-TYPE u115)
(define-constant ERR-INVALID-STAKE_AMOUNT u116)
(define-constant ERR-STAKE_NOT_REQUIRED u117)
(define-constant ERR-VOTER-BANNED u118)
(define-constant ERR-INVALID-CONTRACT-CALL u119)
(define-constant ERR-EMIT-EVENT-FAILED u120)

(define-data-var vote-counter uint u0)
(define-data-var max-votes-per-poll uint u10000)
(define-data-var min-stake-required uint u0)
(define-data-var authority-principal (optional principal) none)

(define-map votes
  { poll-id: uint, voter: principal }
  { option-id: uint, vote-weight: uint, timestamp: uint }
)

(define-map voter-stakes
  { poll-id: uint, voter: principal }
  uint
)

(define-map banned-voters
  principal
  bool
)

(define-map poll-types
  uint
  (string-ascii 50)
)

(define-map vote-events
  uint
  { poll-id: uint, voter: principal, option-id: uint, timestamp: uint }
)

(define-read-only (get-vote (poll-id uint) (voter principal))
  (map-get? votes { poll-id: poll-id, voter: voter })
)

(define-read-only (get-voter-stake (poll-id uint) (voter principal))
  (default-to u0 (map-get? voter-stakes { poll-id: poll-id, voter: voter }))
)

(define-read-only (is-voter-banned (voter principal))
  (default-to false (map-get? banned-voters voter))
)

(define-read-only (get-poll-type (poll-id uint))
  (map-get? poll-types poll-id)
)

(define-read-only (get-vote-event (event-id uint))
  (map-get? vote-events event-id)
)

(define-private (validate-poll-id (poll-id uint))
  (if (> poll-id u0)
      (ok true)
      (err ERR-INVALID-POLL-ID))
)

(define-private (validate-option-id (option-id uint))
  (if (> option-id u0)
      (ok true)
      (err ERR-INVALID-OPTION-ID))
)

(define-private (validate-voter (voter principal))
  (if (not (is-eq voter 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-VOTER))
)

(define-private (validate-timestamp (ts uint))
  (let ((current (unwrap-panic (get-block-info? time block-height))))
    (if (>= ts current)
        (ok true)
        (err ERR-INVALID-TIMESTAMP)))
)

(define-private (validate-stake-amount (amount uint))
  (if (>= amount (var-get min-stake-required))
      (ok true)
      (err ERR-INVALID-STAKE_AMOUNT))
)

(define-private (validate-vote-weight (weight uint))
  (if (and (> weight u0) (<= weight u10))
      (ok true)
      (err ERR-INVALID-VOTE-WEIGHT))
)

(define-private (validate-poll-active (poll { is-active: bool }))
  (if (get is-active poll)
      (ok true)
      (err ERR-POLL-NOT-ACTIVE))
)

(define-private (validate-voting-period (poll { end-time: uint }))
  (let ((current (unwrap-panic (get-block-info? time block-height))))
    (if (<= current (get end-time poll))
        (ok true)
        (err ERR-VOTING_PERIOD_ENDED)))
)

(define-private (validate-not-voted (poll-id uint) (voter principal))
  (if (is-none (map-get? votes { poll-id: poll-id, voter: voter }))
      (ok true)
      (err ERR-ALREADY-VOTED))
)

(define-private (validate-not-banned (voter principal))
  (if (not (is-voter-banned voter))
      (ok true)
      (err ERR-VOTER-BANNED))
)

(define-private (validate-sufficient-stake (poll-id uint) (voter principal) (required uint))
  (let ((stake (get-voter-stake poll-id voter)))
    (if (>= stake required)
        (ok true)
        (err ERR-INSUFFICIENT-STAKE)))
)

(define-public (set-authority-principal (new-principal principal))
  (begin
    (try! (validate-voter new-principal))
    (asserts! (is-none (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-principal (some new-principal))
    (ok true)
  )
)

(define-public (set-max-votes-per-poll (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-VOTE-WEIGHT))
    (asserts! (is-some (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set max-votes-per-poll new-max)
    (ok true)
  )
)

(define-public (set-min-stake-required (new-min uint))
  (begin
    (asserts! (>= new-min u0) (err ERR-INVALID-STAKE_AMOUNT))
    (asserts! (is-some (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set min-stake-required new-min)
    (ok true)
  )
)

(define-public (ban-voter (voter principal))
  (begin
    (asserts! (is-eq tx-sender (unwrap-panic (var-get authority-principal))) (err ERR-NOT-AUTHORIZED))
    (try! (validate-voter voter))
    (map-set banned-voters voter true)
    (ok true)
  )
)

(define-public (unban-voter (voter principal))
  (begin
    (asserts! (is-eq tx-sender (unwrap-panic (var-get authority-principal))) (err ERR-NOT-AUTHORIZED))
    (map-delete banned-voters voter)
    (ok true)
  )
)

(define-public (set-poll-type (poll-id uint) (poll-type (string-ascii 50)))
  (begin
    (asserts! (is-eq tx-sender (unwrap-panic (var-get authority-principal))) (err ERR-NOT-AUTHORIZED))
    (try! (validate-poll-id poll-id))
    (map-set poll-types poll-id poll-type)
    (ok true)
  )
)

(define-public (stake-for-vote (poll-id uint) (amount uint))
  (begin
    (try! (validate-poll-id poll-id))
    (try! (validate-stake-amount amount))
    (let ((current-stake (get-voter-stake poll-id tx-sender)))
      (map-set voter-stakes { poll-id: poll-id, voter: tx-sender } (+ current-stake amount))
      (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
      (ok true)
    )
  )
)

(define-public (cast-vote (poll-id uint) (option-id uint) (vote-weight uint))
  (let
    (
      (poll (unwrap! (map-get? polls { poll-id: poll-id }) (err ERR-POLL-NOT-FOUND)))
      (option (unwrap! (map-get? options { poll-id: poll-id, option-id: option-id }) (err ERR-OPTION-NOT-FOUND)))
      (current-time (unwrap-panic (get-block-info? time block-height)))
      (event-id (var-get vote-counter))
    )
    (try! (validate-poll-id poll-id))
    (try! (validate-option-id option-id))
    (try! (validate-vote-weight vote-weight))
    (try! (validate-poll-active poll))
    (try! (validate-voting-period poll))
    (try! (validate-not-voted poll-id tx-sender))
    (try! (validate-not-banned tx-sender))
    (try! (validate-sufficient-stake poll-id tx-sender (var-get min-stake-required)))
    (asserts! (<= (var-get vote-counter) (var-get max-votes-per-poll)) (err ERR-MAX-VOTES_EXCEEDED))
    (map-insert votes { poll-id: poll-id, voter: tx-sender } { option-id: option-id, vote-weight: vote-weight, timestamp: current-time })
    (map-set options
      { poll-id: poll-id, option-id: option-id }
      (merge option { vote-count: (+ (get vote-count option) vote-weight) })
    )
    (map-set vote-events event-id { poll-id: poll-id, voter: tx-sender, option-id: option-id, timestamp: current-time })
    (var-set vote-counter (+ event-id u1))
    (print { event: "vote-cast", poll-id: poll-id, option-id: option-id, voter: tx-sender })
    (ok true)
  )
)

(define-public (withdraw-stake (poll-id uint) (amount uint))
  (let
    (
      (poll (unwrap! (map-get? polls { poll-id: poll-id }) (err ERR-POLL-NOT-FOUND)))
      (current-stake (get-voter-stake poll-id tx-sender))
    )
    (try! (validate-poll-id poll-id))
    (asserts! (not (get is-active poll)) (err ERR-POLL-NOT-ACTIVE))
    (asserts! (>= current-stake amount) (err ERR-INSUFFICIENT-STAKE))
    (map-set voter-stakes { poll-id: poll-id, voter: tx-sender } (- current-stake amount))
    (try! (as-contract (stx-transfer? amount tx-sender tx-sender)))
    (ok true)
  )
)

(define-read-only (get-total-votes (poll-id uint))
  (fold + (map (lambda (opt) (get vote-count opt)) (filter is-some (map (lambda (id) (map-get? options { poll-id: poll-id, option-id: id })) (range u1 u100)))) u0)
)

(define-read-only (get-vote-count)
  (ok (var-get vote-counter))
)