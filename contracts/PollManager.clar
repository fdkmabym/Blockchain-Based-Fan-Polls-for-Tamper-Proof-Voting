(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-POLL-ID u101)
(define-constant ERR-INVALID-TITLE u102)
(define-constant ERR-INVALID-DESCRIPTION u103)
(define-constant ERR-INVALID-DURATION u104)
(define-constant ERR-POLL-ALREADY-EXISTS u105)
(define-constant ERR-POLL-NOT-FOUND u106)
(define-constant ERR-INVALID-TIMESTAMP u107)
(define-constant ERR-INVALID-CREATOR u108)
(define-constant ERR-POLL-NOT-ACTIVE u109)
(define-constant ERR-INVALID-STAKE-REQUIREMENT u110)
(define-constant ERR-MAX-POLLS-EXCEEDED u111)
(define-constant ERR-INVALID-POLL-TYPE u112)
(define-constant ERR-INVALID-AUTHORITY u113)
(define-constant ERR-INVALID-UPDATE-PARAM u114)
(define-constant ERR-POLL-UPDATE-NOT-ALLOWED u115)
(define-constant ERR-EMIT-EVENT-FAILED u116)

(define-data-var poll-counter uint u0)
(define-data-var max-polls uint u1000)
(define-data-var authority-principal (optional principal) none)

(define-map polls
  { poll-id: uint }
  { title: (string-ascii 100), description: (string-ascii 500), creator: principal, start-time: uint, end-time: uint, is-active: bool, stake-required: uint, poll-type: (string-ascii 50) }
)

(define-map poll-updates
  { poll-id: uint }
  { update-title: (string-ascii 100), update-description: (string-ascii 500), update-timestamp: uint, updater: principal }
)

(define-map poll-events
  uint
  { poll-id: uint, event-type: (string-ascii 50), timestamp: uint }
)

(define-read-only (get-poll (poll-id uint))
  (map-get? polls { poll-id: poll-id })
)

(define-read-only (get-poll-update (poll-id uint))
  (map-get? poll-updates { poll-id: poll-id })
)

(define-read-only (get-poll-event (event-id uint))
  (map-get? poll-events event-id)
)

(define-read-only (get-poll-count)
  (ok (var-get poll-counter))
)

(define-private (validate-title (title (string-ascii 100)))
  (if (> (len title) u0)
      (ok true)
      (err ERR-INVALID-TITLE))
)

(define-private (validate-description (description (string-ascii 500)))
  (if (> (len description) u0)
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-duration (duration uint))
  (if (> duration u0)
      (ok true)
      (err ERR-INVALID-DURATION))
)

(define-private (validate-timestamp (ts uint))
  (let ((current (unwrap-panic (get-block-info? time block-height))))
    (if (>= ts current)
        (ok true)
        (err ERR-INVALID-TIMESTAMP)))
)

(define-private (validate-creator (creator principal))
  (if (not (is-eq creator 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-CREATOR))
)

(define-private (validate-stake-requirement (stake uint))
  (if (>= stake u0)
      (ok true)
      (err ERR-INVALID-STAKE-REQUIREMENT))
)

(define-private (validate-poll-type (poll-type (string-ascii 50)))
  (if (or (is-eq poll-type "standard") (is-eq poll-type "premium") (is-eq poll-type "community"))
      (ok true)
      (err ERR-INVALID-POLL-TYPE))
)

(define-public (set-authority-principal (new-principal principal))
  (begin
    (try! (validate-creator new-principal))
    (asserts! (is-none (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-principal (some new-principal))
    (ok true)
  )
)

(define-public (set-max-polls (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-MAX-POLLS-EXCEEDED))
    (asserts! (is-some (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set max-polls new-max)
    (ok true)
  )
)

(define-public (create-poll (title (string-ascii 100)) (description (string-ascii 500)) (duration uint) (stake-required uint) (poll-type (string-ascii 50)))
  (let
    (
      (poll-id (var-get poll-counter))
      (current-time (unwrap-panic (get-block-info? time block-height)))
      (event-id poll-id)
    )
    (asserts! (< poll-id (var-get max-polls)) (err ERR-MAX-POLLS-EXCEEDED))
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-duration duration))
    (try! (validate-stake-requirement stake-required))
    (try! (validate-poll-type poll-type))
    (try! (validate-creator tx-sender))
    (map-insert polls
      { poll-id: poll-id }
      { title: title, description: description, creator: tx-sender, start-time: current-time, end-time: (+ current-time duration), is-active: true, stake-required: stake-required, poll-type: poll-type }
    )
    (map-insert poll-events
      event-id
      { poll-id: poll-id, event-type: "created", timestamp: current-time }
    )
    (var-set poll-counter (+ poll-id u1))
    (print { event: "poll-created", poll-id: poll-id, creator: tx-sender })
    (ok poll-id)
  )
)

(define-public (update-poll (poll-id uint) (new-title (string-ascii 100)) (new-description (string-ascii 500)))
  (let
    (
      (poll (unwrap! (map-get? polls { poll-id: poll-id }) (err ERR-POLL-NOT-FOUND)))
      (current-time (unwrap-panic (get-block-info? time block-height)))
    )
    (asserts! (is-eq (get creator poll) tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (validate-title new-title))
    (try! (validate-description new-description))
    (asserts! (get is-active poll) (err ERR-POLL-NOT-ACTIVE))
    (try! (validate-timestamp current-time))
    (map-set polls
      { poll-id: poll-id }
      (merge poll { title: new-title, description: new-description })
    )
    (map-set poll-updates
      { poll-id: poll-id }
      { update-title: new-title, update-description: new-description, update-timestamp: current-time, updater: tx-sender }
    )
    (map-insert poll-events
      (var-get poll-counter)
      { poll-id: poll-id, event-type: "updated", timestamp: current-time }
    )
    (print { event: "poll-updated", poll-id: poll-id, updater: tx-sender })
    (ok true)
  )
)

(define-public (close-poll (poll-id uint))
  (let
    (
      (poll (unwrap! (map-get? polls { poll-id: poll-id }) (err ERR-POLL-NOT-FOUND)))
      (current-time (unwrap-panic (get-block-info? time block-height)))
    )
    (asserts! (is-eq (get creator poll) tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (get is-active poll) (err ERR-POLL-NOT-ACTIVE))
    (try! (validate-timestamp current-time))
    (map-set polls
      { poll-id: poll-id }
      (merge poll { is-active: false })
    )
    (map-insert poll-events
      (var-get poll-counter)
      { poll-id: poll-id, event-type: "closed", timestamp: current-time }
    )
    (print { event: "poll-closed", poll-id: poll-id, closer: tx-sender })
    (ok true)
  )
) 
