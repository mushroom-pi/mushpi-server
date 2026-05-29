import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

// Validates that a date string field is strictly after another date string field on the same object.
// Skips validation when either value is absent (combine with @IsOptional() as needed).
export function IsAfterDate(
  referenceProperty: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAfterDate',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [referenceProperty],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [refProp] = args.constraints as [string];
          const refValue = (args.object as Record<string, unknown>)[refProp];

          if (typeof value !== 'string' || typeof refValue !== 'string') {
            return true; // defer to other validators (@IsDateString, @IsOptional)
          }

          return new Date(value) > new Date(refValue);
        },
        defaultMessage(args: ValidationArguments) {
          const [refProp] = args.constraints as [string];
          return `${args.property} must be a date after ${refProp}`;
        },
      },
    });
  };
}
