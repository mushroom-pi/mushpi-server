import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';

const SUPPORTED_TIMEZONES: Set<string> = new Set([
  ...(Intl as any).supportedValuesOf('timeZone'),
  'UTC', // UTC is a valid timezone but not returned by supportedValuesOf
]);

@ValidatorConstraint({ name: 'isValidTimezone' })
class IsValidTimezoneValidator implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return SUPPORTED_TIMEZONES.has(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid IANA timezone (e.g. 'Europe/Madrid'), got '${args.value}'`;
  }
}

export function IsValidTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: IsValidTimezoneValidator,
    });
  };
}
