/**
 * Bot trap. The label stays "Company" for fillers, but the control is out of
 * view and out of the accessibility tree. The name is not website, company,
 * or email, so browsers do not autofill it.
 */
export function HoneypotField({ name = 'hp_field' }: { name?: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '-10000px',
        top: '0',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
      }}
    >
      <label>
        Company
        <input
          type="text"
          name={name}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          defaultValue=""
        />
      </label>
    </div>
  );
}
